# Database Module - Modern Drizzle ORM

## 📁 Structure

```
db/
├── index.ts              # Main exports
├── dbConnection.ts       # Database connection & Drizzle instance
├── queries.ts            # Reusable typed query helpers
└── schema/               # Modular schema definitions
    ├── index.ts          # Export all schemas
    ├── user.ts           # User table & relations
    ├── auth.ts           # Auth tables (tokens, password reset)
    ├── camp.ts           # Camp & member tables
    ├── chat.ts           # Chat, messages, members
    ├── group.ts          # Groups
    ├── room.ts           # Rooms
    ├── payment.ts        # Payments & user payments
    └── location.ts       # User locations
```

## 🚀 Usage Examples

### Basic Insert

```typescript
import { db, user } from '../db';

const newUser = await db
  .insert(user)
  .values({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'hashed_password',
  })
  .returning();
```

### Relational Query (NEW!)

```typescript
import { db } from '../db';

// Get user with all relations
const userWithData = await db.query.user.findFirst({
  where: eq(user.id, userId),
  columns: {
    password: false, // Exclude password
  },
  with: {
    tokens: true,
    location: true,
    memberToCamps: {
      with: {
        camp: true,
      },
    },
  },
});
```

## ✨ Benefits of Modern Drizzle

### Before (Old dbQ.ts)

```typescript
// ❌ Manual joins, no type safety
const query = dbQ
  .createQuery(user, [user.name, passwordReset.token])
  .innerJoin(passwordReset, eq(user.id, passwordReset.userId));
```

### After (New Relations API)

```typescript
// ✅ Type-safe, autocomplete, cleaner
const users = await db.query.user.findMany({
  with: {
    passwordReset: true, // Auto-joined!
    tokens: true,
  },
});
```

## 🎯 Key Features

1. **Modular Schema** - Each domain has its own file
2. **Relations API** - Automatic joins, type-safe nested queries
3. **Type Safety** - Full TypeScript support with autocomplete
4. **Reusable Queries** - Common patterns in `queries.ts`
5. **Clean Architecture** - Separation of concerns

## 📚 Documentation

- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [Relational Queries](https://orm.drizzle.team/docs/rqb)
- [Schema Relations](https://orm.drizzle.team/docs/relations)
