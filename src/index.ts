import express, { Request, Response } from "express";

interface Entity {
  id: number;
  name: string;
  size?: number;
}

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// NOTE: This in-memory array is for prototyping only. Data will be lost on server restart.
// For production, use a persistent database.
let entities: Entity[] = [];
let nextId = 1;

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
  res.json(entities);
});

// GET single entity
app.get("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] GET /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`
  );
  const entity = entities.find((e) => e.id === Number(req.params.id));
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
  const { name } = req.body;
  if (req.body.size && typeof req.body.size !== "number") return res.status(400).json({ error: "Invalid 'size' property data type" });

  if (req.body.size && req.body.size < 0) return res.status(400).json({ error: "'size' must be a non-negative number" });
  
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Invalid or missing 'name' property" });
  
  const entity: Entity = { id: nextId++, name: name.trim() };
  if (req.body.size !== undefined) {
    entity.size = req.body.size;
  }
  entities.push(entity);
  res.status(201).json(entity);
});

// PUT update entity
app.put("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] PUT /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`,
    req.body
  );
  const idx = entities.findIndex((e) => e.id === Number(req.params.id));
  if (idx === -1) return res.status(404).send("Entity not found");
  
  const { name } = req.body;
  if (typeof name !== "string" || !name.trim()) {
    return res
      .status(400)
      .json({ error: "Invalid or missing 'name' property" });
  }
  
  if (req.body.size !== undefined) {
    if (typeof req.body.size !== "number") {
      return res.status(400).json({ error: "Invalid 'size' property data type" });
    }
    if (req.body.size < 0) {
      return res.status(400).json({ error: "'size' must be a non-negative number" });
    }
  }
  
  const updatedEntity: Entity = { 
    id: entities[idx].id, 
    name: name.trim() 
  };
  
  if (req.body.size !== undefined) {
    updatedEntity.size = req.body.size;
  }
  
  entities[idx] = updatedEntity;
  res.json(entities[idx]);
});

// DELETE entity
app.delete("/entities/:id", (req: Request, res: Response) => {
  console.log(
    `[${new Date().toISOString()}] DELETE /entities/${req.params.id} ${
      req.headers["user-agent"]
    }`
  );
  const idx = entities.findIndex((e) => e.id === Number(req.params.id));
  if (idx === -1) return res.status(404).send("Entity not found");
  const deleted = entities.splice(idx, 1);
  res.json(deleted[0]);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
