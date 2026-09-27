#!/usr/bin/env python3
"""Exercise lifecycle ordering/failure propagation using isolated command doubles.

Guest system paths are redirected into a temporary directory. No package manager,
Git mutation, systemd service, Proxmox command or network request is executed.
Real end-to-end readiness and container tests remain separate acceptance gates.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DeploymentScripts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.etc = self.base / 'etc'
        (self.etc / 'systemd/system').mkdir(parents=True)
        self.app = self.base / 'custom-app'
        (self.app / '.git').mkdir(parents=True)
        (self.app / 'dist').mkdir()
        (self.app / 'dist/index.js').write_text('// compiled fixture\n')
        self.log = self.base / 'commands'
        self.env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}',
                        TEST_LOG=str(self.log), INSTALL_PATH=str(self.app),
                        GIT_REPO='https://example.invalid/app.git', GIT_REF='target-sha',
                        PORT='4312', TRAINING_MODE='false')
        for cmd in ['git', 'npm', 'systemctl', 'node', 'chown', 'curl', 'apt-get']:
            self.stub(cmd, '''
printf '%s %s\\n' "${0##*/}" "$*" >> "$TEST_LOG"
if [[ "${FAIL_COMMAND:-}" == "${0##*/} $*" ]]; then exit 42; fi
case "${0##*/} $*" in
  'node -p '*) echo 24;;
  'node -e '*) printf '%064d\\n' 0;;
  'node ') cat >/dev/null; [[ "${FAIL_COMMAND:-}" != readiness ]] || exit 43;;
  'git rev-parse HEAD') echo target-sha;;
esac
''')
        # Only redirect guest filesystem paths and the root precondition. All
        # lifecycle branches and real error handling remain under test.
        src = (ROOT / 'install-api-tests-training-service.sh').read_text()
        src = src.replace('/etc/', f'{self.etc}/').replace('[[ "$EUID" -eq 0 ]]', 'true')
        self.installer = self.base / 'installer.sh'
        self.installer.write_text(src)

    def stub(self, name, source):
        p = self.bin / name
        p.write_text('#!/usr/bin/env bash\nset -e\n' + source)
        p.chmod(0o755)

    def run_installer(self, *args, extra=None):
        return subprocess.run(['bash', str(self.installer), *args],
                              env=dict(self.env, **(extra or {})), text=True, capture_output=True)

    def commands(self):
        return self.log.read_text() if self.log.exists() else ''

    def test_success_and_reinstall_preserve_token_and_custom_settings(self):
        token = self.etc / 'api-tests-training-service.env'
        token.write_text('TRAINING_ADMIN_TOKEN=existing-private-token\n')
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(token.read_text(), 'TRAINING_ADMIN_TOKEN=existing-private-token\n')
        self.assertEqual(token.stat().st_mode & 0o777, 0o600)
        config = (self.etc / 'api-tests-training-service.conf').read_text()
        self.assertIn(f'DEPLOY_INSTALL_PATH={self.app}', config)
        self.assertIn('DEPLOY_PORT=4312', config)
        self.assertIn('npm ci --include=dev', self.commands())
        self.assertLess(self.commands().index('npm run build'), self.commands().index('npm prune --omit=dev'))
        self.assertLess(self.commands().index('npm prune --omit=dev'), self.commands().index('systemctl restart'))
        result = self.run_installer('--update')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(token.read_text(), 'TRAINING_ADMIN_TOKEN=existing-private-token\n')

    def test_update_reads_persistent_settings_without_overrides(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        for key in ['INSTALL_PATH', 'GIT_REPO', 'GIT_REF', 'PORT', 'TRAINING_MODE']:
            self.env.pop(key)
        result = self.run_installer('--update')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'WorkingDirectory={self.app}', (self.etc / 'systemd/system/api-tests-training-service.service').read_text())

    def test_update_refuses_missing_git_before_any_mutation(self):
        (self.app / '.git').rmdir()
        result = self.run_installer('--update')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No Git-managed installation', result.stderr)
        self.assertEqual(self.commands(), '')

    def test_each_failure_propagates_and_preserves_token_config(self):
        stages = ['git fetch origin target-sha', 'npm ci --include=dev',
                  'npm run build', 'npm prune --omit=dev',
                  'systemctl restart api-tests-training-service', 'readiness']
        for stage in stages:
            with self.subTest(stage=stage):
                token = self.etc / 'api-tests-training-service.env'
                config = self.etc / 'api-tests-training-service.conf'
                token.write_text('TRAINING_ADMIN_TOKEN=existing-private-token\n')
                config.write_text('DEPLOY_PORT=9999\n')
                self.log.write_text('')
                result = self.run_installer('--update', extra={'FAIL_COMMAND': stage})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('succeeded at revision', result.stdout)
                self.assertEqual(token.read_text(), 'TRAINING_ADMIN_TOKEN=existing-private-token\n')
                self.assertEqual(config.read_text(), 'DEPLOY_PORT=9999\n')
                if stage.startswith(('git ', 'npm ')):
                    self.assertNotIn('systemctl restart', self.commands())

    def test_wrapper_update_passes_settings_and_failure_status(self):
        engine = self.base / 'update-core/core'
        engine.mkdir(parents=True)
        engine.joinpath('build.func').write_text('''
header_info() { :; }
variables() { :; }
color() { :; }
check_container_storage() { :; }
check_container_resources() { :; }
catch_errors() { set -Ee -o pipefail; }
start() { update_script; }
msg_ok() { echo success; }
msg_error() { echo "$*" >&2; }
''')
        fixture = self.base / 'updater-fixture.sh'
        fixture.write_text('''#!/usr/bin/env bash
[[ "$1" == --update && "$INSTALL_PATH" == /opt/custom && "$PORT" == 4312 && "$GIT_REF" == target-sha ]] || exit 90
exit "${FIXTURE_EXIT:-0}"
''')
        env = dict(self.env, COMMUNITY_SCRIPTS_CORE_DIR=str(engine.parent),
                   var_install_script_path=str(fixture), var_install_path='/opt/custom',
                   var_port='4312', var_git_ref='target-sha')
        for status in [0, 42]:
            result = subprocess.run(['bash', str(ROOT / 'ct-api-tests-training-service.sh')],
                                    env=dict(env, FIXTURE_EXIT=str(status)), capture_output=True, text=True)
            self.assertEqual(result.returncode, status, result.stderr)
            if status:
                self.assertNotIn('success', result.stdout)
        fixture.write_text('')
        result = subprocess.run(['bash', str(ROOT / 'ct-api-tests-training-service.sh')],
                                env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Could not obtain application installer', result.stderr)

    def test_custom_installer_uses_native_core_dispatch_once(self):
        engine = self.base / 'core/core'
        engine.mkdir(parents=True)
        staged_output = self.base / 'native-installer'
        engine.joinpath('build.func').write_text('''
# Native bootstrap probes for optional Incus before it enables catch_errors.
# A false probe must not terminate the wrapper before initialization completes.
optional_platform_probe() { return 1; }
optional_platform_probe
header_info() { :; }
variables() { NSAPP=apiteststrainingservice; var_install="$NSAPP-install"; }
color() { :; }
check_container_storage() { :; }
check_container_resources() { :; }
catch_errors() { set -Ee -o pipefail; }
start() { DEV_MODE_KEEP="${TEST_KEEP_MODE:-false}"; }
build_container() { cp "$COMMUNITY_SCRIPTS_ROOT/install/$var_install.sh" "$STAGED_OUTPUT"; }
description() { IP=192.0.2.1; }
msg_ok() { :; }
msg_error() { echo "$*" >&2; }
''')
        self.stub('pveversion', 'exit 0\n')
        env = dict(self.env, COMMUNITY_SCRIPTS_CORE_DIR=str(engine.parent),
                   STAGED_OUTPUT=str(staged_output), var_install_script_path=str(self.installer))
        result = subprocess.run(['bash', str(ROOT / 'ct-api-tests-training-service.sh')],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        staged = staged_output.read_text()
        self.assertIn('exec bash /usr/local/lib/api-tests-training-service/installer.sh', staged)
        self.assertIn('INSTALLER_URL=file:///usr/local/lib/api-tests-training-service/installer.sh', staged)
        self.assertNotIn('pct exec', staged)
        syntax = subprocess.run(['bash', '-n', str(staged_output)], capture_output=True, text=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        staged_output.unlink()
        result = subprocess.run(['bash', str(ROOT / 'ct-api-tests-training-service.sh')],
                                env=dict(env, TEST_KEEP_MODE='true'), capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Debug keep mode is unsupported', result.stderr)
        self.assertFalse(staged_output.exists(), 'Keep mode must stop before container creation')
        self.assertNotIn('Completed successfully', result.stdout)


if __name__ == '__main__':
    unittest.main()
