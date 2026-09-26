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

export class EntityService {
  private entities: Entity[] = [];
  private nextId = 1;
  private trainingMode: boolean;

  constructor(trainingMode = false) {
    this.trainingMode = trainingMode;
  }

  private sanitizeName(name: string): string {
    return name.trim();
  }

  private validateInput(input: EntityInput): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof input.name !== 'string' || !input.name.trim()) {
      errors.push({ field: 'name', message: "Invalid or missing 'name' property" });
    }

    if (input.size !== undefined) {
      if (typeof input.size !== 'number') {
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
    if (this.trainingMode && Math.random() < 0.3) {
      // Intentionally skip trimming to create bug for trainees
      name = input.name;
    }

    const entity: Entity = {
      id: this.nextId++,
      name,
    };

    if (input.size !== undefined) {
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
    if (this.trainingMode && Math.random() < 0.25) {
      name = input.name;
    }

    // Preserve existing fields when updating partially
    const existingEntity = this.entities[idx];
    const updatedEntity: Entity = { 
      ...existingEntity,
      name,
    };
    
    if (input.size !== undefined) {
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

  // For testing purposes
  reset(): void {
    this.entities = [];
    this.nextId = 1;
  }

  getTrainingMode(): boolean {
    return this.trainingMode;
  }
}
