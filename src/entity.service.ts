export interface Entity {
  id: number;
  name: string;
  size?: number;
}

export interface EntityInput {
  name: string;
  size?: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

const TRAINING_FEATURES = ['skipTrimOnCreate', 'skipTrimOnUpdate'] as const;
type TrainingFeature = typeof TRAINING_FEATURES[number];

export interface TrainingConfig {
  enabled: boolean;
  features: Record<TrainingFeature, boolean>;
}

interface TrainingConfigUpdate {
  enabled?: boolean;
  features?: Partial<Record<TrainingFeature, boolean>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTrainingFeature(key: string): key is TrainingFeature {
  return (TRAINING_FEATURES as readonly string[]).includes(key);
}

function validateConfigUpdate(input: unknown): ValidationError[] {
  if (!isPlainObject(input)) {
    return [{ field: 'config', message: 'Config update must be an object' }];
  }

  const errors: ValidationError[] = [];
  for (const key of Object.keys(input)) {
    if (key !== 'enabled' && key !== 'features') {
      errors.push({ field: key, message: `Unknown property '${key}'` });
    }
  }

  if ('enabled' in input && typeof input.enabled !== 'boolean') {
    errors.push({ field: 'enabled', message: "'enabled' must be a boolean" });
  }

  if ('features' in input) {
    if (!isPlainObject(input.features)) {
      errors.push({ field: 'features', message: "'features' must be an object" });
    } else {
      for (const [key, value] of Object.entries(input.features)) {
        if (!isTrainingFeature(key)) {
          errors.push({ field: `features.${key}`, message: `Unknown feature '${key}'` });
        } else if (typeof value !== 'boolean') {
          errors.push({ field: `features.${key}`, message: `'features.${key}' must be a boolean` });
        }
      }
    }
  }

  return errors;
}

export class TrainingConfigManager {
  private static instance: TrainingConfigManager;
  private config: TrainingConfig;

  private constructor() {
    this.config = this.loadFromEnv();
  }

  static getInstance(): TrainingConfigManager {
    if (!TrainingConfigManager.instance) {
      TrainingConfigManager.instance = new TrainingConfigManager();
    }
    return TrainingConfigManager.instance;
  }

  getConfig(): TrainingConfig {
    return { ...this.config, features: { ...this.config.features } };
  }

  updateConfig(input: unknown): { config?: TrainingConfig; errors?: ValidationError[] } {
    const errors = validateConfigUpdate(input);
    if (errors.length > 0) {
      return { errors };
    }

    const update = input as TrainingConfigUpdate;
    this.config = {
      enabled: update.enabled ?? this.config.enabled,
      features: { ...this.config.features, ...update.features },
    };
    return { config: this.getConfig() };
  }

  private loadFromEnv(): TrainingConfig {
    return {
      enabled: process.env.TRAINING_MODE === 'true',
      features: {
        skipTrimOnCreate: process.env.TRAINING_SKIP_TRIM_CREATE !== 'false',
        skipTrimOnUpdate: process.env.TRAINING_SKIP_TRIM_UPDATE !== 'false',
      },
    };
  }
}

export class EntityService {
  private entities: Entity[] = [];
  private nextId = 1;
  private configManager: TrainingConfigManager;

  constructor() {
    this.configManager = TrainingConfigManager.getInstance();
  }

  private get config(): TrainingConfig {
    return this.configManager.getConfig();
  }

  private get trainingMode(): boolean {
    return this.config.enabled;
  }

  private shouldSkipTrimCreate(): boolean {
    return this.trainingMode && this.config.features.skipTrimOnCreate;
  }

  private shouldSkipTrimUpdate(): boolean {
    return this.trainingMode && this.config.features.skipTrimOnUpdate;
  }

  private sanitizeName(name: string): string {
    return name.trim();
  }

  private validateInput(input: EntityInput): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof input.name !== 'string' || !input.name.trim()) {
      errors.push({ field: 'name', message: "Invalid or missing 'name' property" });
    }

    if (input.size != null) {
      if (typeof input.size !== 'number' || !Number.isFinite(input.size)) {
        errors.push({ field: 'size', message: "Invalid 'size' property data type" });
      } else if (input.size < 0) {
        errors.push({ field: 'size', message: "'size' must be a non-negative number" });
      }
    }

    return errors;
  }

  create(input: EntityInput): { entity?: Entity; errors?: ValidationError[] } {
    const errors = this.validateInput(input);
    if (errors.length > 0) {
      return { errors };
    }

    let name = this.sanitizeName(input.name);
    
    // Training mode bug injection: sometimes skip trimming
    if (this.shouldSkipTrimCreate() && Math.random() < 0.3) {
      // Intentionally skip trimming to create bug for trainees
      name = input.name;
    }

    const entity: Entity = {
      id: this.nextId++,
      name,
    };

    if (input.size != null) {
      entity.size = input.size;
    }

    this.entities.push(entity);
    return { entity };
  }

  getAll(): Entity[] {
    return [...this.entities];
  }

  getById(id: number): Entity | undefined {
    return this.entities.find(e => e.id === id);
  }

  update(id: number, input: EntityInput): { entity?: Entity; errors?: ValidationError[]; notFound?: boolean } {
    const idx = this.entities.findIndex(e => e.id === id);
    if (idx === -1) {
      return { notFound: true };
    }

    const errors = this.validateInput(input);
    if (errors.length > 0) {
      return { errors };
    }

    let name = this.sanitizeName(input.name);
    
    // Training mode bug: skip trimming on update
    if (this.shouldSkipTrimUpdate() && Math.random() < 0.25) {
      name = input.name;
    }

    // PUT semantics: replace the entity, so an omitted size is removed
    const updatedEntity: Entity = {
      id,
      name,
    };

    if (input.size != null) {
      updatedEntity.size = input.size;
    }

    this.entities[idx] = updatedEntity;
    return { entity: this.entities[idx] };
  }

  delete(id: number): { entity?: Entity; notFound?: boolean } {
    const idx = this.entities.findIndex(e => e.id === id);
    if (idx === -1) {
      return { notFound: true };
    }
    const [deleted] = this.entities.splice(idx, 1);
    return { entity: deleted };
  }
}
