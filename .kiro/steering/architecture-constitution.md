# Architecture Constitution: Modular 3-Tier System

## Core Principles

This project follows a strict modular 3-tier architecture with emphasis on clean code, reusability, and maintainability. Testing is handled separately and should not be included in implementation tasks.

## 3-Tier Architecture

### Presentation Layer (Controllers/Routes)
- Handle HTTP requests and responses
- Input validation and sanitization
- Route definitions and middleware
- No business logic
- Thin layer that delegates to service layer

### Business Logic Layer (Services)
- Core application logic and workflows
- Business rules and validations
- Orchestrate data operations
- Reusable across different presentation interfaces
- Independent of data access implementation

### Data Access Layer (Repositories/DAOs)
- Database queries and operations
- Data mapping and transformation
- Abstract database implementation details
- Single responsibility per repository
- No business logic

## Modularity Requirements

### Module Structure
- Each feature is a self-contained module
- Modules export clear interfaces
- Dependencies flow downward (Presentation → Business → Data)
- No circular dependencies
- Shared utilities in separate common modules

### File Organization
```
src/
├── controllers/     # Presentation layer
├── services/        # Business logic layer
├── repositories/    # Data access layer
├── models/          # Data models and types
├── utils/           # Shared utilities
├── config/          # Configuration
└── middleware/      # Reusable middleware
```

## Clean Code Standards

### Naming Conventions
- Use descriptive, intention-revealing names
- Classes and types: PascalCase
- Functions and variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Interfaces: prefix with 'I' or use descriptive names

### Function Design
- Single Responsibility Principle
- Keep functions small (< 20 lines preferred)
- Maximum 3-4 parameters (use objects for more)
- Pure functions when possible
- Avoid side effects in business logic

### Code Organization
- One class/interface per file
- Group related functionality
- Extract magic numbers to named constants
- Use dependency injection
- Avoid global state

### Error Handling
- Use custom error classes
- Handle errors at appropriate layer
- Propagate errors with context
- No silent failures

## Reusability Guidelines

### DRY Principle
- Extract common logic to utilities
- Create reusable service methods
- Share types and interfaces
- Avoid code duplication

### Composition Over Inheritance
- Prefer composition patterns
- Use interfaces for contracts
- Keep inheritance hierarchies shallow
- Favor small, composable functions

### Configuration
- Externalize configuration
- Use environment variables
- Type-safe configuration objects
- No hardcoded values

## Implementation Rules

### What to Include
- Clean, production-ready code
- Proper error handling
- Type safety (TypeScript)
- Documentation comments for public APIs
- Dependency injection setup

### What to Exclude
- No test files or test code
- No test-specific dependencies
- No mock implementations
- Testing is handled separately

## Code Review Checklist

Before considering code complete, verify:
- [ ] Proper layer separation (no layer violations)
- [ ] No business logic in controllers
- [ ] No data access in services
- [ ] Single responsibility per class/function
- [ ] Descriptive naming throughout
- [ ] No code duplication
- [ ] Proper error handling
- [ ] Type safety maintained
- [ ] Configuration externalized
- [ ] No testing code included

## Example Pattern

```typescript
// Model
interface IUser {
  id: string;
  email: string;
  name: string;
}

// Repository (Data Layer)
class UserRepository {
  async findById(id: string): Promise<IUser | null> {
    // Data access only
  }
}

// Service (Business Layer)
class UserService {
  constructor(private userRepo: UserRepository) {}
  
  async getUser(id: string): Promise<IUser> {
    // Business logic
    const user = await this.userRepo.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}

// Controller (Presentation Layer)
class UserController {
  constructor(private userService: UserService) {}
  
  async getUser(req: Request, res: Response) {
    // Request handling only
    const user = await this.userService.getUser(req.params.id);
    res.json(user);
  }
}
```

## Enforcement

All code contributions must adhere to this constitution. Violations should be refactored before proceeding with additional features.
