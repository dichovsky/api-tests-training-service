# API Tests Training Service

This project is a Node.js service built with TypeScript, designed to provide a platform for training and running automated API tests. It serves as a foundation for developing, executing, and managing API test scenarios in a scalable and maintainable way.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [API Endpoints](#api-endpoints)
- [GraphQL](#graphql)
- [Proxmox Deployment](#proxmox-deployment)
- [Contributing](#contributing)
- [License](#license)

## Installation

To get started, clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd api-tests-training-service
npm install
```

## Usage

To start the service, run:

```bash
npm start
```

The service will launch the API testing platform, accessible at `http://localhost:3000` (or the port specified in your configuration).

To enable training mode with intentional bugs for trainees to find:

```bash
TRAINING_MODE=true npm start
```

## Features

- Create and manage API test scenarios
- Execute automated API tests
- Monitor test results and logs
- Easily extendable for custom test logic
- **REST API** for CRUD operations on entities
- **GraphQL API** for flexible querying and mutations
- **Training mode** with intentional bugs for learning
- **Proxmox CT script** for easy home lab deployment

## API Endpoints

### REST API

- `GET /entities` - Get all entities
- `GET /entities/:id` - Get entity by ID
- `POST /entities` - Create entity
- `PUT /entities/:id` - Update entity
- `DELETE /entities/:id` - Delete entity

### GraphQL API

- `POST /graphql` - GraphQL endpoint with Apollo Sandbox

**Queries:**
- `entities` - Get all entities
- `entity(id: ID!)` - Get entity by ID
- `trainingMode` - Check if training mode is enabled

**Mutations:**
- `createEntity(input: EntityInput!)` - Create entity
- `updateEntity(id: ID!, input: EntityInput!)` - Update entity
- `deleteEntity(id: ID!)` - Delete entity

## GraphQL

The GraphQL endpoint provides a flexible interface for trainees to learn GraphQL queries and mutations. Access the interactive playground at `http://localhost:3000/graphql`.

Example query:
```graphql
query {
  entities {
    id
    name
    size
  }
}
```

Example mutation:
```graphql
mutation {
  createEntity(input: {name: "Test", size: 10}) {
    id
    name
    size
  }
}
```

## Proxmox Deployment

Deploy this service to Proxmox VE using Community Scripts:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

**Features:**
- Unprivileged LXC container
- Automatic Node.js 24 installation
- Git-based updates with `update_script()`
- Systemd service with auto-restart
- Configurable port and training mode

**Update the service:**
```bash
# Inside the container
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dichovsky/api-tests-training-service/main/ct-api-tests-training-service.sh)"
```

The service will automatically pull latest code, rebuild TypeScript, and restart.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
