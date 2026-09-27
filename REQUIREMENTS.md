# API Tests Training Service - Requirements Document

## Req-1
The service should provide an option to create and store an entity with the following properties:
    - name (string, required)
    - size (positive number, optional)

## Req-2
While storing an entity, the service should assign a unique id to it and return it to the user (id property)

## Req-3
While storing an entity, the service should remove the leading and trailing white space characters from a name

## Req-4
The service should provide an option to search an entity by unique id

## Req-5
The service should provide an option to update the following entity properties:
    - name
    - size

## Req-6
The service should provide an option to delete an entity by unique id

## Req-7
The service should provide an option to obtain all stored entities

## Req-8
The service should provide a GraphQL endpoint for testing purposes
    - Support queries for retrieving entities
    - Support mutations for creating, updating, and deleting entities
    - GraphQL schema should mirror REST API functionality

## Req-9
The service should support both REST and GraphQL interfaces simultaneously
    - REST endpoints at /entities
    - GraphQL endpoint at /graphql
    - Both should use shared business logic

## Req-10
The service should support training mode for identifying issues
    - Training mode can be enabled via TRAINING_MODE environment variable
    - In training mode, service may introduce intentional bugs for trainees to find
    - Training mode status should be queryable via GraphQL
