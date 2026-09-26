import express, { Request, Response } from "express";
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityService } from './entity.service';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

const trainingMode = process.env.TRAINING_MODE === 'true';
const entityService = new EntityService(trainingMode);

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
  const reqPath = join(__dirname, '..', 'REQUIREMENTS.md');
  const reqContent = readFileSync(reqPath, 'utf-8');
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
          <pre>${reqContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

app.get("/api-specs/REQUIREMENTS.md", (req: Request, res: Response) => {
  const reqPath = join(__dirname, '..', 'REQUIREMENTS.md');
  const reqContent = readFileSync(reqPath, 'utf-8');
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', 'attachment; filename="REQUIREMENTS.md"');
  res.send(reqContent);
});

app.get("/api-specs/rest", (req: Request, res: Response) => {
  const specPath = join(__dirname, '..', 'api-rest.yaml');
  const specContent = readFileSync(specPath, 'utf-8');
  res.setHeader('Content-Type', 'text/yaml');
  res.send(specContent);
});

app.get("/api-specs/rest.yaml", (req: Request, res: Response) => {
  const specPath = join(__dirname, '..', 'api-rest.yaml');
  const specContent = readFileSync(specPath, 'utf-8');
  res.setHeader('Content-Type', 'application/yaml');
  res.setHeader('Content-Disposition', 'attachment; filename="api-rest.yaml"');
  res.send(specContent);
});

app.get("/api-specs/graphql", (req: Request, res: Response) => {
  const schemaPath = join(__dirname, '..', 'api-graphql.graphql');
  const schemaContent = readFileSync(schemaPath, 'utf-8');
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
          <pre><code>${schemaContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

app.get("/api-specs/graphql.graphql", (req: Request, res: Response) => {
  const schemaPath = join(__dirname, '..', 'api-graphql.graphql');
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="api-graphql.graphql"');
  res.send(schemaContent);
});

app.get("/api-specs/graphql.md", (req: Request, res: Response) => {
  const docsPath = join(__dirname, '..', 'api-graphql.md');
  const docsContent = readFileSync(docsPath, 'utf-8');
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
          <div class="markdown">${docsContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
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
  // Serve a minimal OpenAPI UI using Swagger UI CDN and a JS OpenAPI spec
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
            const spec = {
              openapi: "3.0.0",
              info: {
                title: "Entities API",
                version: "1.1.0",
                description: "A simple API for managing entities."
              },
              servers: [
                { url: "http://magdich.cloud:${PORT}" }
              ],
              paths: {
                "/entities": {
                  get: {
                    summary: "Get all entities",
                    responses: {
                      "200": {
                        description: "A list of entities",
                        content: {
                          "application/json": {
                            schema: {
                              type: "array",
                              items: { $ref: "#/components/schemas/Entity" }
                            }
                          }
                        }
                      }
                    }
                  },
                  post: {
                    summary: "Create a new entity",
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/EntityInput" }
                        }
                      }
                    },
                    responses: {
                      "201": {
                        description: "Entity created",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/Entity" }
                          }
                        }
                      },
                      "400": { description: "Invalid input" }
                    }
                  }
                },
                "/entities/{id}": {
                  get: {
                    summary: "Get an entity by ID",
                    parameters: [
                      {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "integer" }
                      }
                    ],
                    responses: {
                      "200": {
                        description: "Entity found",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/Entity" }
                          }
                        }
                      },
                      "404": { description: "Entity not found" }
                    }
                  },
                  put: {
                    summary: "Update an entity by ID",
                    parameters: [
                      {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "integer" }
                      }
                    ],
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/EntityInput" }
                        }
                      }
                    },
                    responses: {
                      "200": {
                        description: "Entity updated",
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/Entity" }
                          }
                        }
                      },
                      "400": { description: "Invalid input" },
                      "404": { description: "Entity not found" }
                    }
                  },
                  delete: {
                    summary: "Delete an entity by ID",
                    parameters: [
                      {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "integer" }
                      }
                    ],
                    responses: {
                      "200": { description: "Entity deleted" },
                      "404": { description: "Entity not found" }
                    }
                  }
                }
              },
              components: {
                schemas: {
                  Entity: {
                    type: "object",
                    properties: {
                      id: { type: "integer", example: 1 },
                      name: { type: "string", example: "Sample Entity" },
                      size: { type: "number", example: 10, description: "Optional positive number" }
                    }
                  },
                  EntityInput: {
                    type: "object",
                    properties: {
                      name: { type: "string", example: "Sample Entity" },
                      size: { type: "number", example: 10, description: "Optional positive number" }
                    },
                    required: ["name"]
                  }
                }
              }
            };
            window.ui = SwaggerUIBundle({
              spec: spec,
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

// GET requirements
app.get("/requirements", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET /requirements ${req.headers["user-agent"]}`
  );
  
  const requirementsHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>API Tests Training Service - Requirements</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { 
            margin: 0; 
            padding: 0; 
            background: #f8fafc; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            color: #334155;
          }
          .container { 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 2rem; 
          }
          h1 { 
            color: #1e293b; 
            border-bottom: 3px solid #3b82f6; 
            padding-bottom: 0.5rem; 
            margin-bottom: 2rem;
          }
          .requirement { 
            background: white; 
            margin: 1.5rem 0; 
            padding: 1.5rem; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border-left: 4px solid #3b82f6;
          }
          .req-id { 
            font-weight: 600; 
            color: #3b82f6; 
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
          }
          .req-description { 
            margin-bottom: 0.75rem; 
          }
          .properties { 
            background: #f1f5f9; 
            padding: 1rem; 
            border-radius: 4px; 
            margin-top: 0.75rem;
          }
          .properties ul { 
            margin: 0; 
            padding-left: 1.5rem; 
          }
          .properties li { 
            margin: 0.25rem 0; 
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
          }
          .nav-link {
            display: inline-block;
            margin-top: 2rem;
            padding: 0.75rem 1.5rem;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
          }
          .nav-link:hover {
            background: #2563eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>API Tests Training Service - Requirements Document</h1>
          
          <div class="requirement">
            <div class="req-id">Req-1</div>
            <div class="req-description">
              The service should provide an option to create and store an entity with the following properties:
            </div>
            <div class="properties">
              <ul>
                <li>name (string, required)</li>
                <li>size (positive number, optional)</li>
              </ul>
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-2</div>
            <div class="req-description">
              While storing an entity, the service should assign a unique id to it and return it to the user (id property)
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-3</div>
            <div class="req-description">
              While storing an entity, the service should remove the leading and trailing white space characters from a name
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-4</div>
            <div class="req-description">
              The service should provide an option to search an entity by unique id
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-5</div>
            <div class="req-description">
              The service should provide an option to update the following entity properties:
            </div>
            <div class="properties">
              <ul>
                <li>name</li>
                <li>size</li>
              </ul>
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-6</div>
            <div class="req-description">
              The service should provide an option to delete an entity by unique id
            </div>
          </div>

          <div class="requirement">
            <div class="req-id">Req-7</div>
            <div class="req-description">
              The service should provide an option to obtain all stored entities
            </div>
          </div>

          <a href="/" class="nav-link">← Back to API Documentation</a>
        </div>
      </body>
    </html>
  `;
  
  res.send(requirementsHtml);
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
  if (!entity) return res.status(404).send("Entity not found");
  console.log(entity);
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
  if (result.notFound) return res.status(404).send("Entity not found");
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
  if (result.notFound) return res.status(404).send("Entity not found");
  res.json(result.entity);
});

// GraphQL setup
const typeDefs = `
  type Entity {
    id: ID!
    name: String!
    size: Float
  }

  input EntityInput {
    name: String!
    size: Float
  }

  type Query {
    entities: [Entity!]!
    entity(id: ID!): Entity
    trainingMode: Boolean!
  }

  type Mutation {
    createEntity(input: EntityInput!): Entity!
    updateEntity(id: ID!, input: EntityInput!): Entity!
    deleteEntity(id: ID!): Entity!
  }
`;

const resolvers = {
  Query: {
    entities: () => entityService.getAll(),
    entity: (_: any, { id }: { id: string }) => entityService.getById(Number(id)),
    trainingMode: () => entityService.getTrainingMode(),
  },
  Mutation: {
    createEntity: (_: any, { input }: { input: any }) => {
      const result = entityService.create(input);
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      return result.entity;
    },
    updateEntity: (_: any, { id, input }: { id: string; input: any }) => {
      const result = entityService.update(Number(id), input);
      if (result.notFound) {
        throw new Error("Entity not found");
      }
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      return result.entity;
    },
    deleteEntity: (_: any, { id }: { id: string }) => {
      const result = entityService.delete(Number(id));
      if (result.notFound) {
        throw new Error("Entity not found");
      }
      return result.entity;
    },
  },
};

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
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
