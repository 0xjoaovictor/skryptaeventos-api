# SkryptaEventos API - New Modules Documentation

## Overview

This document describes the three new modules added to the SkryptaEventos API:
1. **Custom Forms Module** - Create custom form fields for event registration
2. **Sessions Module** - Manage user sessions and authentication
3. **Audit Logs Module** - Track important system actions

---

## 1. Custom Forms Module

### Location
`src/custom-forms/`

### Purpose
Allows event organizers to create custom registration form fields for their events. This enables collecting additional information from attendees beyond the standard fields.

### Features
- Create custom form fields with various types (TEXT, EMAIL, PHONE, CPF, DATE, etc.)
- Configure field validation and display order
- Support for placeholder text and help text
- Field-level required/optional settings
- Reorder fields via drag-and-drop API
- Permission-based access (organizers can only edit their own event fields)

### Endpoints

#### POST /api/custom-forms
Create a new custom form field
- **Auth**: Required (ORGANIZER, ADMIN)
- **Body**:
```json
{
  "eventId": "event_id",
  "fieldName": "company_name",
  "fieldLabel": "Company Name",
  "fieldType": "TEXT",
  "placeholder": "Enter your company name",
  "helpText": "Official registered company name",
  "isRequired": true,
  "displayOrder": 0,
  "configuration": {
    "minLength": 3,
    "maxLength": 100
  }
}
```

#### GET /api/custom-forms
Get all custom form fields with pagination
- **Query params**: `eventId`, `page`, `limit`

#### GET /api/custom-forms/event/:eventId
Get all custom form fields for a specific event (ordered by displayOrder)

#### GET /api/custom-forms/:id
Get a specific custom form field

#### PATCH /api/custom-forms/:id
Update a custom form field
- **Auth**: Required (ORGANIZER, ADMIN)

#### DELETE /api/custom-forms/:id
Delete a custom form field
- **Auth**: Required (ORGANIZER, ADMIN)

#### PUT /api/custom-forms/event/:eventId/reorder
Reorder custom form fields
- **Auth**: Required (ORGANIZER, ADMIN)
- **Body**:
```json
{
  "fieldIds": ["field_id_1", "field_id_2", "field_id_3"]
}
```

### Field Types (from Prisma schema)
- TEXT
- EMAIL
- PHONE
- CPF
- DATE
- DATETIME
- NUMBER
- CURRENCY
- SELECT
- MULTISELECT
- CHECKBOX
- RADIO
- TEXTAREA
- FILE
- URL

### Configuration Examples

**Text field with validation**:
```json
{
  "configuration": {
    "minLength": 3,
    "maxLength": 50,
    "pattern": "^[a-zA-Z ]+$"
  }
}
```

**Select field with options**:
```json
{
  "configuration": {
    "options": [
      {"value": "vip", "label": "VIP"},
      {"value": "regular", "label": "Regular"},
      {"value": "student", "label": "Student"}
    ]
  }
}
```

**Number field with range**:
```json
{
  "configuration": {
    "min": 0,
    "max": 100,
    "step": 1
  }
}
```

---

## 2. Sessions Module

### Location
`src/sessions/`

### Purpose
Manages user authentication sessions, including session creation, validation, and cleanup. Provides endpoints for users to view and manage their active sessions.

### Features
- Session creation and validation
- List active sessions per user
- Logout from current session
- Logout from specific session
- Logout from all sessions
- Automatic cleanup of expired sessions (runs hourly via cron job)
- Session statistics

### Endpoints

#### GET /api/sessions/my-sessions
Get all active sessions for the current user
- **Auth**: Required
- **Response**:
```json
[
  {
    "id": "session_id",
    "userAgent": "Mozilla/5.0...",
    "ipAddress": "192.168.1.1",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "expiresAt": "2025-12-20T10:00:00.000Z"
  }
]
```

#### GET /api/sessions/stats
Get session statistics for current user
- **Auth**: Required
- **Response**:
```json
{
  "activeSessions": 3,
  "totalSessions": 5
}
```

#### POST /api/sessions/logout
Logout from current session
- **Auth**: Required

#### DELETE /api/sessions/:sessionId
Terminate a specific session
- **Auth**: Required

#### POST /api/sessions/logout-all
Logout from all sessions (including current)
- **Auth**: Required

#### POST /api/sessions/logout-all-except-current
Logout from all sessions except the current one
- **Auth**: Required

### Service Methods

**SessionsService** provides the following methods:
- `createSession(userId, token, expiresAt, userAgent?, ipAddress?)` - Create a new session
- `validateSession(token)` - Validate if a session token is valid and not expired
- `findUserSessions(userId)` - Get all active sessions for a user
- `logout(token, userId)` - Logout from a specific token
- `logoutSession(sessionId, userId)` - Logout from a specific session ID
- `logoutAllSessions(userId, exceptToken?)` - Logout from all sessions
- `cleanExpiredSessions()` - Remove expired sessions (runs automatically every hour)
- `getSessionStats(userId)` - Get session statistics

### Cron Job
The module includes a cron job that runs every hour to clean up expired sessions:
```typescript
@Cron(CronExpression.EVERY_HOUR)
async cleanExpiredSessions()
```

---

## 3. Audit Logs Module

### Location
`src/audit-logs/`

### Purpose
Tracks important system actions for security, compliance, and debugging purposes. Records who did what, when, and what changed.

### Features
- Log all important system actions
- Query logs with multiple filters
- Track changes (old values vs new values)
- User activity tracking
- Action statistics
- Entity history tracking
- IP address and user agent tracking

### Endpoints

#### GET /api/audit-logs
Get all audit logs with filtering and pagination
- **Auth**: Required (ADMIN only)
- **Query params**:
  - `userId` - Filter by user
  - `action` - Filter by action type
  - `entityType` - Filter by entity type (Event, Order, etc.)
  - `entityId` - Filter by specific entity
  - `startDate` - Filter by date range start
  - `endDate` - Filter by date range end
  - `page` - Page number
  - `limit` - Items per page

#### GET /api/audit-logs/my-activity
Get audit logs for the current user
- **Auth**: Required
- **Query params**: `page`, `limit`

#### GET /api/audit-logs/stats/actions
Get action statistics
- **Auth**: Required (ADMIN only)
- **Query params**: `startDate`, `endDate`
- **Response**:
```json
[
  {
    "action": "CREATE_EVENT",
    "count": 45
  },
  {
    "action": "UPDATE_ORDER",
    "count": 128
  }
]
```

#### GET /api/audit-logs/stats/entity-types
Get entity type statistics
- **Auth**: Required (ADMIN only)
- **Query params**: `startDate`, `endDate`

#### GET /api/audit-logs/stats/user/:userId
Get user activity statistics
- **Auth**: Required (ADMIN only)
- **Query params**: `days` (default: 30)

#### GET /api/audit-logs/entity/:entityType/:entityId
Get all audit logs for a specific entity
- **Auth**: Required (ADMIN, ORGANIZER)
- **Example**: `/api/audit-logs/entity/Event/event_123`

#### GET /api/audit-logs/:id
Get a specific audit log
- **Auth**: Required (ADMIN only)

### Audit Actions (AuditAction enum)

**Event Actions**:
- CREATE_EVENT
- UPDATE_EVENT
- DELETE_EVENT
- PUBLISH_EVENT
- UNPUBLISH_EVENT

**Order Actions**:
- CREATE_ORDER
- UPDATE_ORDER
- CANCEL_ORDER
- COMPLETE_ORDER

**Payment Actions**:
- CREATE_PAYMENT
- CONFIRM_PAYMENT
- REFUND_PAYMENT

**Ticket Actions**:
- CREATE_TICKET
- UPDATE_TICKET
- DELETE_TICKET
- CHECK_IN
- CHECK_OUT
- CANCEL_CHECK_IN

**User Actions**:
- CREATE_USER
- UPDATE_USER
- DELETE_USER
- LOGIN
- LOGOUT
- VERIFY_EMAIL
- PASSWORD_RESET

**Custom Form Actions**:
- CREATE_FORM_FIELD
- UPDATE_FORM_FIELD
- DELETE_FORM_FIELD

**Promo Code Actions**:
- CREATE_PROMO_CODE
- UPDATE_PROMO_CODE
- DELETE_PROMO_CODE
- APPLY_PROMO_CODE

**Refund Actions**:
- CREATE_REFUND
- APPROVE_REFUND
- REJECT_REFUND

### Usage Example

To log an action in your service:

```typescript
import { AuditLogsService, AuditAction } from '../audit-logs';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private auditLogs: AuditLogsService,
  ) {}

  async create(createDto: CreateEventDto, userId: string, req: Request) {
    const event = await this.prisma.event.create({
      data: createDto,
    });

    // Log the action
    await this.auditLogs.log(
      AuditAction.CREATE_EVENT,
      'Event',
      event.id,
      {
        userId,
        newValues: event,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    return event;
  }

  async update(id: string, updateDto: UpdateEventDto, userId: string, req: Request) {
    const oldEvent = await this.prisma.event.findUnique({ where: { id } });

    const event = await this.prisma.event.update({
      where: { id },
      data: updateDto,
    });

    // Log the update with old and new values
    await this.auditLogs.log(
      AuditAction.UPDATE_EVENT,
      'Event',
      event.id,
      {
        userId,
        oldValues: oldEvent,
        newValues: event,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    return event;
  }
}
```

### Service Methods

**AuditLogsService** provides:
- `createLog(createDto)` - Create an audit log entry
- `log(action, entityType, entityId, options?)` - Simplified method to create logs
- `findAll(query)` - Query logs with filters
- `findOne(id)` - Get a specific log
- `findByEntity(entityType, entityId)` - Get all logs for an entity
- `findByUser(userId, page, limit)` - Get all logs for a user
- `getActionStats(startDate?, endDate?)` - Get action statistics
- `getEntityTypeStats(startDate?, endDate?)` - Get entity type statistics
- `getUserActivityStats(userId, days)` - Get user activity stats

### Important Notes
- Audit logging is designed to fail gracefully - errors in audit logging will not break the application
- All logs include timestamps automatically
- Logs are immutable - they cannot be updated or deleted through the API
- Keep sensitive data out of audit logs (passwords, tokens, etc.)

---

## Installation

### 1. Install Dependencies

The new modules require `@nestjs/schedule` for the cron job functionality:

```bash
npm install @nestjs/schedule
```

Or if using yarn:
```bash
yarn add @nestjs/schedule
```

### 2. Database Schema

Make sure your Prisma schema includes the following models:
- `CustomFormField`
- `Session`
- `AuditLog`

Run migrations:
```bash
npm run db:migrate
```

Or push to database:
```bash
npm run db:push
```

### 3. Environment Variables

Add to your `.env` file:
```env
JWT_SECRET=your-secret-key
JWT_EXPIRATION=7d
```

---

## Testing the Modules

### Test Custom Forms
```bash
# Create a custom form field
curl -X POST http://localhost:3000/api/custom-forms \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event_123",
    "fieldName": "dietary_restrictions",
    "fieldLabel": "Dietary Restrictions",
    "fieldType": "TEXTAREA",
    "isRequired": false,
    "displayOrder": 1
  }'

# Get fields for an event
curl http://localhost:3000/api/custom-forms/event/event_123
```

### Test Sessions
```bash
# Get my active sessions
curl http://localhost:3000/api/sessions/my-sessions \
  -H "Authorization: Bearer YOUR_TOKEN"

# Logout from all except current
curl -X POST http://localhost:3000/api/sessions/logout-all-except-current \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Audit Logs
```bash
# Get my activity
curl http://localhost:3000/api/audit-logs/my-activity \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get action stats (admin only)
curl http://localhost:3000/api/audit-logs/stats/actions \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Integration with Existing Modules

To integrate audit logging in your existing modules:

1. Import the AuditLogsModule in your module:
```typescript
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  // ...
})
```

2. Inject the service in your controller/service:
```typescript
constructor(private auditLogs: AuditLogsService) {}
```

3. Log actions:
```typescript
await this.auditLogs.log(AuditAction.CREATE_ORDER, 'Order', order.id, {
  userId: user.id,
  newValues: order,
});
```

---

## Security Considerations

1. **Custom Forms**: Only event organizers and admins can create/edit fields for their events
2. **Sessions**: Users can only manage their own sessions
3. **Audit Logs**:
   - Only admins can view all logs
   - Users can only view their own activity
   - Logs are immutable through the API
   - Sensitive data should never be logged

---

## Performance Notes

1. **Custom Forms**: Fields are cached per event, use `displayOrder` for efficient sorting
2. **Sessions**: Expired sessions are cleaned automatically every hour
3. **Audit Logs**:
   - Use pagination for large result sets
   - Consider archiving old logs periodically
   - Index on `userId`, `entityType`, `entityId`, `action`, and `createdAt` for optimal query performance

---

## Future Enhancements

### Custom Forms
- Field conditional logic (show field X if field Y has value Z)
- Field groups/sections
- Import/export form templates
- Form preview mode

### Sessions
- Device fingerprinting
- Suspicious activity detection
- Session duration analytics
- Geographic session tracking

### Audit Logs
- Log retention policies
- Export logs to external systems
- Real-time audit log streaming
- Anomaly detection

---

## Support

For issues or questions about these modules, please contact the development team or create an issue in the repository.
