import express, { Request, Response } from "express";

interface Entity {
  id: number;
  name: string;
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
                version: "1.0.0",
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
                      name: { type: "string", example: "Sample Entity" }
                    }
                  },
                  EntityInput: {
                    type: "object",
                    properties: {
                      name: { type: "string", example: "Sample Entity" }
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
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Invalid or missing 'name' property" });
  }
  const entity: Entity = { id: nextId++, name: name.trim() };
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
    return res.status(400).json({ error: "Invalid or missing 'name' property" });
  }
  entities[idx] = { id: entities[idx].id, name: name.trim() };
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
