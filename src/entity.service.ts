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

export interface TrainingConfig {
  enabled: boolean;
  features: {
    skipTrimOnCreate: boolean;
    skipTrimOnUpdate: boolean;
    flakyEndpoint: boolean;
    rateLimiting: boolean;
    slowEndpoint: boolean;
    paginationEdgeCases: boolean;
    bulkPartialFailures: boolean;
    graphqlComplexityLimit: boolean;
  };
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

  updateConfig(newConfig: Partial<TrainingConfig>): TrainingConfig {
    this.config = {
      ...this.config,
      ...newConfig,
      features: { ...this.config.features, ...(newConfig.features || {}) }
    };
    return this.getConfig();
  }

  private loadFromEnv(): TrainingConfig {
    return {
      enabled: process.env.TRAINING_MODE === 'true',
      features: {
        skipTrimOnCreate: process.env.TRAINING_SKIP_TRIM_CREATE !== 'false',
        skipTrimOnUpdate: process.env.TRAINING_SKIP_TRIM_UPDATE !== 'false',
        flakyEndpoint: process.env.TRAINING_FLAKY !== 'false',
        rateLimiting: process.env.TRAINING_RATE_LIMIT !== 'false',
        slowEndpoint: process.env.TRAINING_SLOW !== 'false',
        paginationEdgeCases: process.env.TRAINING_PAGINATION !== 'false',
        bulkPartialFailures: process.env.TRAINING_BULK_FAIL !== 'false',
        graphqlComplexityLimit: process.env.TRAINING_GRAPHQL_LIMIT !== 'false',
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

  // For testing purposes
  reset(): void {
    this.entities = [];
    this.nextId = 1;
  }

  getTrainingMode(): boolean {
    return this.trainingMode;
  }
}
