# API Tests Training Service - GraphQL Endpoint Added

## Overview
Added GraphQL endpoint for training purposes alongside existing REST API.

## Changes Made

### 1. Dependencies Added
- `@apollo/server@^5.5.1` - Apollo Server for GraphQL
- `@as-integrations/express4@^1.1.2` - Express 4 integration for Apollo Server 5
- `graphql@^16.11.0` - GraphQL core library

### 2. New Files
- `src/entity.service.ts` - Shared service layer with validation and sanitization
  - Extracted business logic from REST routes
  - Shared validation used by both REST and GraphQL
  - Methods: create, getAll, getById, update, delete

### 3. Updated `src/index.ts`
- Refactored REST routes to use `EntityService`
- Added GraphQL schema with SDL:
  - Query: `entities`, `entity(id)`
  - Mutation: `createEntity`, `updateEntity`, `deleteEntity`
- Apollo Server mounted at `/graphql`
- Both REST (`/entities`) and GraphQL coexist

## GraphQL Schema

```graphql
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
}

type Mutation {
  createEntity(input: EntityInput!): Entity!
  updateEntity(id: ID!, input: EntityInput!): Entity!
  deleteEntity(id: ID!): Entity!
}
```

## Testing

### REST Endpoints
- `GET /entities` - List all
- `GET /entities/:id` - Get one
- `POST /entities` - Create
- `PUT /entities/:id` - Update
- `DELETE /entities/:id` - Delete

### GraphQL Endpoint
- `POST /graphql` - GraphQL queries and mutations
- Playground available at `http://localhost:3000/graphql`

## Example Queries

```graphql
# Get all entities
query {
  entities {
    id
    name
    size
  }
}

# Create entity
mutation {
  createEntity(input: {name: "Test", size: 10}) {
    id
    name
    size
  }
}

# Update entity
mutation {
  updateEntity(id: 1, input: {name: "Updated", size: 20}) {
    id
    name
  }
}
```

## Architecture
- Shared `EntityService` ensures consistency between REST and GraphQL
- Validation logic centralized
- Name trimming applied consistently
- Zero-tolerance TypeScript strict mode maintained
