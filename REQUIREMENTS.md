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

## Req-6
The service should provide an option to delete an entity by unique id

## Req-7
The service should provide an option to obtain all stored entities
