import express, { Request, Response } from "express";
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityService, EntityInput } from './entity.service';
import { escapeHtml } from './utils/html-sanitizer';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

const trainingMode = process.env.TRAINING_MODE === 'true';
const entityService = new EntityService(trainingMode);

// Cache spec files at startup to avoid blocking I/O
const specFiles = {
  rest: readFileSync(join(__dirname, '..', 'api-rest.yaml'), 'utf-8'),
  graphql: readFileSync(join(__dirname, '..', 'api-graphql.graphql'), 'utf-8'),
  graphqlDocs: readFileSync(join(__dirname, '..', 'api-graphql.md'), 'utf-8'),
  requirements: readFileSync(join(__dirname, '..', 'REQUIREMENTS.md'), 'utf-8'),
};

// Serve API specifications
app.get("/api-specs", (req: Request, res: Response) => {
  const specsHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>API Specifications</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }
          .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
          h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; }
          .spec-card { background: white; margin: 1.5rem 0; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .spec-title { font-size: 1.25rem; font-weight: 600; color: #3b82f6; margin-bottom: 0.5rem; }
          .spec-desc { color: #64748b; margin-bottom: 1rem; }
          .spec-link { display: inline-block; margin-right: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; }
          .spec-link:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>API Specifications</h1>
          <div class="spec-card">
            <div class="spec-title">Requirements</div>
            <div class="spec-desc">Service requirements and specifications</div>
            <a href="/api-specs/requirements" class="spec-link">View Requirements</a>
            <a href="/api-specs/REQUIREMENTS.md" class="spec-link">Download Markdown</a>
          </div>
          <div class="spec-card">
            <div class="spec-title">REST API</div>
            <div class="spec-desc">OpenAPI 3.1 specification for REST endpoints</div>
            <a href="/api-specs/rest" class="spec-link">View Spec</a>
            <a href="/api-specs/rest.yaml" class="spec-link">Download YAML</a>
          </div>
          <div class="spec-card">
            <div class="spec-title">GraphQL API</div>
            <div class="spec-desc">GraphQL schema and documentation</div>
            <a href="/api-specs/graphql" class="spec-link">View Schema</a>
            <a href="/api-specs/graphql.graphql" class="spec-link">Download SDL</a>
            <a href="/api-specs/graphql.md" class="spec-link">View Docs</a>
          </div>
        </div>
      </body>
    </html>
  `;
  res.send(specsHtml);
});

app.get("/api-specs/requirements", (req: Request, res: Response) => {
  const reqContent = specFiles.requirements;
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Requirements</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #334155; }
          .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
          h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; margin-bottom: 2rem; }
          .requirement { background: white; margin: 1.5rem 0; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #3b82f6; }
          .req-id { font-weight: 600; color: #3b82f6; font-size: 1.1rem; margin-bottom: 0.5rem; }
          pre { background: #f1f5f9; padding: 1rem; border-radius: 4px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>API Tests Training Service - Requirements</h1>
          <pre>${escapeHtml(reqContent)}</pre>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

app.get("/api-specs/REQUIREMENTS.md", (req: Request, res: Response) => {
  const reqContent = specFiles.requirements;
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', 'attachment; filename="REQUIREMENTS.md"');
  res.send(reqContent);
});

app.get("/api-specs/rest", (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(specFiles.rest);
});

app.get("/api-specs/rest.yaml", (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/x-yaml');
  res.setHeader('Content-Disposition', 'attachment; filename="api-rest.yaml"');
  res.send(specFiles.rest);
});

app.get("/api-specs/graphql", (req: Request, res: Response) => {
  const schemaContent = specFiles.graphql;
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>GraphQL Schema</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; padding: 0; background: #0f172a; color: #e2e8f0; font-family: 'Monaco', 'Menlo', monospace; }
          .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
          h1 { color: #38bdf8; border-bottom: 2px solid #38bdf8; padding-bottom: 0.5rem; }
          pre { background: #1e293b; padding: 1.5rem; border-radius: 8px; overflow-x: auto; }
          code { color: #a5f3fc; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>GraphQL Schema</h1>
          <pre><code>${escapeHtml(schemaContent)}</code></pre>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

app.get("/api-specs/graphql.graphql", (req: Request, res: Response) => {
  const schemaContent = specFiles.graphql;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="api-graphql.graphql"');
  res.send(schemaContent);
});

app.get("/api-specs/graphql.md", (req: Request, res: Response) => {
  const docsContent = specFiles.graphqlDocs;
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>GraphQL Documentation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #334155; }
          .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
          h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; }
          pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
          code { background: #e2e8f0; padding: 0.2rem 0.4rem; border-radius: 3px; font-family: 'Monaco', 'Menlo', monospace; }
          .markdown { white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>GraphQL API Documentation</h1>
          <div class="markdown">${escapeHtml(docsContent)}</div>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

// Root endpoint with HTML API specification
app.get("/", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET / ${req.headers["user-agent"]}`
  );
  // Serve a minimal OpenAPI UI using Swagger UI CDN and the REST spec from /api-specs/rest
  const apiDocumentationHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Entities API - OpenAPI Documentation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
        <style>
          html, body { margin: 0; padding: 0; background: #f8fafc; }
          #swagger-ui { margin: 0 auto; max-width: 900px; }
        </style>
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script>
          window.onload = function() {
            window.ui = SwaggerUIBundle({
              url: "/api-specs/rest",
              dom_id: '#swagger-ui',
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset
              ],
              layout: "BaseLayout"
            });
          }
        </script>
      </body>
    </html>
  `;
  res.send(apiDocumentationHtml);
});

// GET requirements: kept for old links, content now comes from REQUIREMENTS.md
app.get("/requirements", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET /requirements ${req.headers["user-agent"]}`
  );
  res.redirect("/api-specs/requirements");
});

// GET all entities
app.get("/entities", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET /entities ${req.headers["user-agent"]}`
  );
  res.json(entityService.getAll());
});

// GET single entity
app.get("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`
  );
  const entity = entityService.getById(Number(req.params.id));
  if (!entity) return res.status(404).json({ error: "Entity not found" });
  res.json(entity);
});

// POST create entity
app.post("/entities", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] POST /entities ${req.headers["user-agent"]}`,
    req.body
  );
  
  const result = entityService.create(req.body);
  if (result.errors) {
    return res.status(400).json({ error: result.errors[0].message });
  }
  
  res.status(201).json(result.entity);
});

// PUT update entity
app.put("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] PUT /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`,
    req.body
  );
  
  const result = entityService.update(Number(req.params.id), req.body);
  if (result.notFound) return res.status(404).json({ error: "Entity not found" });
  if (result.errors) {
    return res.status(400).json({ error: result.errors[0].message });
  }
  
  res.json(result.entity);
});

// DELETE entity
app.delete("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] DELETE /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`
  );
  const result = entityService.delete(Number(req.params.id));
  if (result.notFound) return res.status(404).json({ error: "Entity not found" });
  res.json(result.entity);
});

// GraphQL setup
const typeDefs = specFiles.graphql;

interface CreateEntityArgs {
  name: string;
  size?: number;
}

interface UpdateEntityArgs {
  id: number;
  name: string;
  size?: number;
}

const resolvers = {
  Query: {
    entities: (): any[] => entityService.getAll(),
    entity: (_: any, { id }: { id: string }) => {
      const idNum = Number(id);
      if (isNaN(idNum)) return null;
      return entityService.getById(idNum);
    },
    trainingMode: () => entityService.getTrainingMode(),
  },
  Mutation: {
    createEntity: (_: any, { input }: { input: EntityInput }) => {
      const result = entityService.create(input);
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      return result.entity;
    },
    updateEntity: (_: any, { id, input }: { id: string; input: EntityInput }) => {
      const idNum = Number(id);
      if (isNaN(idNum)) {
        throw new Error('Invalid ID');
      }
      const result = entityService.update(idNum, input);
      if (result.notFound) {
        throw new Error('Entity not found');
      }
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      return result.entity;
    },
    deleteEntity: (_: any, { id }: { id: string }) => {
      const idNum = Number(id);
      if (isNaN(idNum)) {
        throw new Error('Invalid ID');
      }
      const result = entityService.delete(idNum);
      if (result.notFound) {
        throw new Error('Entity not found');
      }
      return result.entity;
    },
  },
};

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Never leak stack traces (file paths) in responses, whatever NODE_ENV is
    includeStacktraceInErrorResponses: false,
  });

  await server.start();

  app.use('/graphql', expressMiddleware(server));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`REST API: http://localhost:${PORT}/entities`);
    console.log(`GraphQL Playground: http://localhost:${PORT}/graphql`);
    console.log(`Training mode: ${trainingMode ? 'ENABLED' : 'DISABLED'}`);
  });
}

startServer();
