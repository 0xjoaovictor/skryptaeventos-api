# Frontend Integration Guide - Waitlist API
**Version:** 1.0
**Last Updated:** 2026-01-07
**API Base URL:** `https://api.yourdomain.com/api`

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [API Endpoint](#api-endpoint)
3. [Authentication](#authentication)
4. [Request Format](#request-format)
5. [Response Format](#response-format)
6. [Error Handling](#error-handling)
7. [Validation Rules](#validation-rules)
8. [CORS Configuration](#cors-configuration)
9. [TypeScript Types](#typescript-types)
10. [React Example](#react-example)
11. [Next.js Example](#nextjs-example)
12. [Best Practices](#best-practices)
13. [Testing](#testing)

---

## Overview

The Waitlist API allows churches to register their interest in using the SkryptaEventos platform. This is a **public endpoint** that doesn't require authentication.

### Key Features:
- ✅ No authentication required
- ✅ Automatic email deduplication
- ✅ Input validation and sanitization
- ✅ Rate limiting (60 requests/minute)
- ✅ CORS enabled for your domain
- ✅ Portuguese error messages

---

## API Endpoint

### POST /waitlist

**URL:** `https://api.yourdomain.com/api/waitlist`

**Method:** `POST`

**Content-Type:** `application/json`

**Rate Limit:** 60 requests per minute per IP

**Public:** Yes (no authentication required)

---

## Authentication

**None required.** This is a public endpoint.

---

## Request Format

### Required Fields

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `churchName` | string | ✅ Yes | 500 | Name of the church |
| `responsibleName` | string | ✅ Yes | 500 | Name of the responsible person |
| `email` | string | ✅ Yes | 255 | Contact email (must be valid format) |
| `whatsapp` | string | ✅ Yes | 15 | WhatsApp phone number |
| `city` | string | ✅ Yes | 500 | City name |

### Request Example

```json
{
  "churchName": "Igreja Batista Central",
  "responsibleName": "João Silva",
  "email": "joao.silva@igreja.com",
  "whatsapp": "5511999999999",
  "city": "São Paulo"
}
```

### Phone Number Formats Accepted

```javascript
// With country code (Brazil)
"5511999999999"  // +55 11 99999-9999

// Without country code
"11999999999"    // 11 99999-9999

// International
"1234567890123"  // Any valid international number
```

---

## Response Format

### Success Response (201 Created)

```json
{
  "message": "Cadastro realizado com sucesso! Entraremos em contato em breve.",
  "data": {
    "id": "cm1abc123xyz",
    "email": "joao.silva@igreja.com",
    "churchName": "Igreja Batista Central",
    "createdAt": "2026-01-07T15:30:00.000Z"
  }
}
```

**HTTP Status:** `201 Created`

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Success message in Portuguese |
| `data.id` | string | Unique waitlist entry ID |
| `data.email` | string | Registered email |
| `data.churchName` | string | Registered church name |
| `data.createdAt` | string | ISO 8601 timestamp |

---

## Error Handling

### Validation Error (400 Bad Request)

**Scenario:** Missing required fields or invalid format

```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "whatsapp must be a valid phone number"
  ],
  "error": "Bad Request"
}
```

**Common Validation Errors:**
- `"churchName should not be empty"`
- `"email must be an email"`
- `"whatsapp must be a valid phone number"`
- `"responsibleName should not be empty"`
- `"city should not be empty"`

### Duplicate Email (409 Conflict)

**Scenario:** Email already registered in waitlist

```json
{
  "statusCode": 409,
  "message": "Este email já está na lista de espera"
}
```

**HTTP Status:** `409 Conflict`

### Rate Limit Exceeded (429 Too Many Requests)

**Scenario:** More than 60 requests per minute

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**HTTP Status:** `429 Too Many Requests`

**What to do:** Wait 60 seconds before retrying

### Server Error (500 Internal Server Error)

**Scenario:** Unexpected server error

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

**HTTP Status:** `500 Internal Server Error`

**What to do:** Show generic error message, retry after a few seconds

---

## Validation Rules

### Email
- ✅ Must be valid email format
- ✅ Automatically trimmed (whitespace removed)
- ✅ Case-insensitive for duplicate checking
- ❌ Empty strings not allowed

### Phone Number (WhatsApp)
- ✅ Must match regex: `/^\+?[1-9]\d{1,14}$/`
- ✅ Can include country code (optional `+`)
- ✅ Must start with 1-9
- ✅ 2-15 digits total
- ❌ Letters or special characters not allowed (except leading `+`)

### Text Fields (churchName, responsibleName, city)
- ✅ Required (cannot be empty)
- ✅ Automatically trimmed
- ✅ Special characters allowed (accents, quotes, etc.)
- ✅ Maximum 500 characters
- ❌ Empty strings not allowed

---

## CORS Configuration

### Allowed Origins

The API is configured to accept requests **only from whitelisted domains**.

**Your domain must be configured in the API's `CORS_ORIGIN` environment variable.**

### CORS Headers

The API will return these CORS headers for allowed origins:

```
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Allow-Credentials: true
```

### Testing CORS Locally

For local development, make sure your local domain is added:

```
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,https://yourdomain.com
```

---

## TypeScript Types

### Request Type

```typescript
/**
 * Waitlist registration form data
 */
export interface WaitlistFormData {
  /** Name of the church */
  churchName: string;

  /** Name of the person responsible */
  responsibleName: string;

  /** Contact email (must be valid format) */
  email: string;

  /** WhatsApp phone number (with or without country code) */
  whatsapp: string;

  /** City where the church is located */
  city: string;
}
```

### Response Types

```typescript
/**
 * Successful waitlist registration response
 */
export interface WaitlistSuccessResponse {
  /** Success message in Portuguese */
  message: string;

  /** Registration data */
  data: {
    /** Unique entry ID */
    id: string;

    /** Registered email */
    email: string;

    /** Registered church name */
    churchName: string;

    /** Registration timestamp (ISO 8601) */
    createdAt: string;
  };
}

/**
 * Error response from the API
 */
export interface WaitlistErrorResponse {
  /** HTTP status code */
  statusCode: number;

  /** Error message(s) - can be string or array */
  message: string | string[];

  /** Error type */
  error?: string;

  /** Request timestamp */
  timestamp?: string;

  /** Request path */
  path?: string;
}
```

### API Client Type

```typescript
/**
 * Result type for waitlist API calls
 */
export type WaitlistApiResult =
  | { success: true; data: WaitlistSuccessResponse }
  | { success: false; error: WaitlistErrorResponse };
```

---

## React Example

### 1. Create API Client

```typescript
// src/services/waitlistApi.ts

import type {
  WaitlistFormData,
  WaitlistSuccessResponse,
  WaitlistErrorResponse,
  WaitlistApiResult,
} from '../types/waitlist';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.yourdomain.com/api';

/**
 * Register a church in the waitlist
 */
export async function registerWaitlist(
  data: WaitlistFormData
): Promise<WaitlistApiResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();

    if (response.ok) {
      return {
        success: true,
        data: responseData as WaitlistSuccessResponse,
      };
    }

    return {
      success: false,
      error: responseData as WaitlistErrorResponse,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        statusCode: 500,
        message: 'Erro ao conectar com o servidor. Tente novamente.',
      },
    };
  }
}
```

### 2. React Hook

```typescript
// src/hooks/useWaitlist.ts

import { useState } from 'react';
import { registerWaitlist } from '../services/waitlistApi';
import type { WaitlistFormData } from '../types/waitlist';

export function useWaitlist() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (data: WaitlistFormData) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const result = await registerWaitlist(data);

    if (result.success) {
      setSuccess(true);
      return { success: true, data: result.data };
    } else {
      // Handle error messages
      const errorMessage = Array.isArray(result.error.message)
        ? result.error.message.join(', ')
        : result.error.message;

      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const reset = () => {
    setError(null);
    setSuccess(false);
    setLoading(false);
  };

  return {
    submit,
    reset,
    loading,
    error,
    success,
  };
}
```

### 3. Form Component

```typescript
// src/components/WaitlistForm.tsx

import React, { useState } from 'react';
import { useWaitlist } from '../hooks/useWaitlist';
import type { WaitlistFormData } from '../types/waitlist';

export function WaitlistForm() {
  const { submit, loading, error, success, reset } = useWaitlist();

  const [formData, setFormData] = useState<WaitlistFormData>({
    churchName: '',
    responsibleName: '',
    email: '',
    whatsapp: '',
    city: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await submit(formData);

    if (result.success) {
      // Clear form
      setFormData({
        churchName: '',
        responsibleName: '',
        email: '',
        whatsapp: '',
        city: '',
      });

      // Show success message for 5 seconds
      setTimeout(() => reset(), 5000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          ✓ Cadastro realizado com sucesso! Entraremos em contato em breve.
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          ✗ {error}
        </div>
      )}

      {/* Church Name */}
      <div>
        <label htmlFor="churchName" className="block text-sm font-medium mb-1">
          Nome da Igreja *
        </label>
        <input
          type="text"
          id="churchName"
          name="churchName"
          value={formData.churchName}
          onChange={handleChange}
          required
          maxLength={500}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: Igreja Batista Central"
        />
      </div>

      {/* Responsible Name */}
      <div>
        <label htmlFor="responsibleName" className="block text-sm font-medium mb-1">
          Nome do Responsável *
        </label>
        <input
          type="text"
          id="responsibleName"
          name="responsibleName"
          value={formData.responsibleName}
          onChange={handleChange}
          required
          maxLength={500}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: João Silva"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          E-mail *
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: contato@igreja.com"
        />
      </div>

      {/* WhatsApp */}
      <div>
        <label htmlFor="whatsapp" className="block text-sm font-medium mb-1">
          WhatsApp *
        </label>
        <input
          type="tel"
          id="whatsapp"
          name="whatsapp"
          value={formData.whatsapp}
          onChange={handleChange}
          required
          pattern="^\+?[1-9]\d{1,14}$"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: 5511999999999"
        />
        <p className="text-xs text-gray-500 mt-1">
          Formato: 5511999999999 ou 11999999999
        </p>
      </div>

      {/* City */}
      <div>
        <label htmlFor="city" className="block text-sm font-medium mb-1">
          Cidade *
        </label>
        <input
          type="text"
          id="city"
          name="city"
          value={formData.city}
          onChange={handleChange}
          required
          maxLength={500}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: São Paulo"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Enviando...' : 'Entrar na Lista de Espera'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        * Campos obrigatórios
      </p>
    </form>
  );
}
```

---

## Next.js Example

### 1. API Route (Server-Side)

```typescript
// app/api/waitlist/route.ts

import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_URL || 'https://api.yourdomain.com/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE_URL}/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        statusCode: 500,
        message: 'Erro ao processar requisição'
      },
      { status: 500 }
    );
  }
}
```

### 2. Server Action (Next.js 14+)

```typescript
// app/actions/waitlist.ts

'use server';

import type { WaitlistFormData } from '@/types/waitlist';

export async function registerWaitlistAction(formData: WaitlistFormData) {
  const API_URL = process.env.API_URL || 'https://api.yourdomain.com/api';

  try {
    const response = await fetch(`${API_URL}/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, data };
    }

    return { success: false, error: data };
  } catch (error) {
    return {
      success: false,
      error: {
        statusCode: 500,
        message: 'Erro ao conectar com o servidor',
      },
    };
  }
}
```

### 3. Client Component with Server Action

```typescript
// app/components/WaitlistForm.tsx

'use client';

import { useState } from 'react';
import { registerWaitlistAction } from '@/app/actions/waitlist';

export function WaitlistForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      churchName: formData.get('churchName') as string,
      responsibleName: formData.get('responsibleName') as string,
      email: formData.get('email') as string,
      whatsapp: formData.get('whatsapp') as string,
      city: formData.get('city') as string,
    };

    const result = await registerWaitlistAction(data);

    setLoading(false);

    if (result.success) {
      setMessage({
        type: 'success',
        text: 'Cadastro realizado com sucesso! Entraremos em contato em breve.',
      });
      e.currentTarget.reset();
    } else {
      const errorText = Array.isArray(result.error.message)
        ? result.error.message.join(', ')
        : result.error.message;

      setMessage({
        type: 'error',
        text: errorText,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Message Alert */}
      {message && (
        <div
          className={`px-4 py-3 rounded border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? '✓' : '✗'} {message.text}
        </div>
      )}

      {/* Form fields same as React example... */}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {loading ? 'Enviando...' : 'Entrar na Lista de Espera'}
      </button>
    </form>
  );
}
```

---

## Best Practices

### 1. Client-Side Validation

Always validate on the client side before submitting:

```typescript
function validateForm(data: WaitlistFormData): string | null {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return 'E-mail inválido';
  }

  // Phone validation
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(data.whatsapp)) {
    return 'WhatsApp inválido. Use apenas números (ex: 5511999999999)';
  }

  // Required fields
  if (!data.churchName.trim()) return 'Nome da igreja é obrigatório';
  if (!data.responsibleName.trim()) return 'Nome do responsável é obrigatório';
  if (!data.city.trim()) return 'Cidade é obrigatória';

  return null; // Valid
}
```

### 2. Handle Rate Limiting

Implement retry logic with exponential backoff:

```typescript
async function registerWithRetry(
  data: WaitlistFormData,
  maxRetries = 3
): Promise<WaitlistApiResult> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await registerWaitlist(data);

    // If rate limited, wait and retry
    if (!result.success && result.error.statusCode === 429) {
      const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return result;
  }

  return {
    success: false,
    error: {
      statusCode: 429,
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    },
  };
}
```

### 3. Phone Number Formatting

Help users format phone numbers:

```typescript
function formatPhoneNumber(value: string): string {
  // Remove non-numeric characters
  const numbers = value.replace(/\D/g, '');

  // Limit length
  return numbers.substring(0, 15);
}

// In your input handler:
onChange={(e) => {
  const formatted = formatPhoneNumber(e.target.value);
  setFormData({ ...formData, whatsapp: formatted });
}}
```

### 4. Loading States

Always show clear loading states:

```typescript
{loading && (
  <div className="flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    <span className="ml-2">Enviando...</span>
  </div>
)}
```

### 5. Accessibility

Make your form accessible:

```typescript
<input
  type="email"
  id="email"
  name="email"
  aria-required="true"
  aria-label="E-mail de contato"
  aria-describedby="email-help"
  // ...
/>
<span id="email-help" className="sr-only">
  Digite seu e-mail de contato
</span>
```

### 6. Analytics Tracking

Track form submissions:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Track form submission
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'waitlist_form_submit', {
      event_category: 'engagement',
      event_label: 'Waitlist Registration',
    });
  }

  const result = await submit(formData);

  if (result.success) {
    // Track success
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'waitlist_registration_success', {
        event_category: 'conversion',
      });
    }
  }
};
```

---

## Testing

### 1. Unit Tests (Jest + React Testing Library)

```typescript
// __tests__/WaitlistForm.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaitlistForm } from '../components/WaitlistForm';

// Mock fetch
global.fetch = jest.fn();

describe('WaitlistForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders form fields', () => {
    render(<WaitlistForm />);

    expect(screen.getByLabelText(/nome da igreja/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome do responsável/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cidade/i)).toBeInTheDocument();
  });

  it('submits form successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'Cadastro realizado com sucesso!',
        data: { id: '123', email: 'test@test.com' },
      }),
    });

    render(<WaitlistForm />);

    fireEvent.change(screen.getByLabelText(/nome da igreja/i), {
      target: { value: 'Test Church' },
    });
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), {
      target: { value: '5511999999999' },
    });
    fireEvent.change(screen.getByLabelText(/cidade/i), {
      target: { value: 'São Paulo' },
    });

    fireEvent.click(screen.getByRole('button', { name: /entrar na lista/i }));

    await waitFor(() => {
      expect(screen.getByText(/cadastro realizado com sucesso/i)).toBeInTheDocument();
    });
  });

  it('shows error on duplicate email', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        statusCode: 409,
        message: 'Este email já está na lista de espera',
      }),
    });

    render(<WaitlistForm />);

    // Fill and submit form...

    await waitFor(() => {
      expect(screen.getByText(/já está na lista de espera/i)).toBeInTheDocument();
    });
  });
});
```

### 2. E2E Tests (Cypress)

```typescript
// cypress/e2e/waitlist.cy.ts

describe('Waitlist Registration', () => {
  beforeEach(() => {
    cy.visit('/waitlist');
  });

  it('successfully registers a church', () => {
    cy.intercept('POST', '**/api/waitlist', {
      statusCode: 201,
      body: {
        message: 'Cadastro realizado com sucesso!',
        data: {
          id: '123',
          email: 'test@example.com',
          churchName: 'Test Church',
          createdAt: new Date().toISOString(),
        },
      },
    }).as('registerWaitlist');

    cy.get('input[name="churchName"]').type('Test Church');
    cy.get('input[name="responsibleName"]').type('John Doe');
    cy.get('input[name="email"]').type('test@example.com');
    cy.get('input[name="whatsapp"]').type('5511999999999');
    cy.get('input[name="city"]').type('São Paulo');

    cy.get('button[type="submit"]').click();

    cy.wait('@registerWaitlist');

    cy.contains('Cadastro realizado com sucesso!').should('be.visible');
  });

  it('shows error for duplicate email', () => {
    cy.intercept('POST', '**/api/waitlist', {
      statusCode: 409,
      body: {
        statusCode: 409,
        message: 'Este email já está na lista de espera',
      },
    }).as('duplicateEmail');

    // Fill form...
    cy.get('button[type="submit"]').click();

    cy.wait('@duplicateEmail');

    cy.contains('já está na lista de espera').should('be.visible');
  });
});
```

---

## Frequently Asked Questions

### Q: Do I need to implement authentication?
**A:** No, the waitlist endpoint is public and doesn't require authentication.

### Q: What happens if the same email is submitted twice?
**A:** The API returns a 409 Conflict error with the message: "Este email já está na lista de espera"

### Q: Is there a rate limit?
**A:** Yes, 60 requests per minute per IP address. If exceeded, you'll receive a 429 error.

### Q: Should I validate on the client side?
**A:** Yes, always implement client-side validation for better UX, but remember the API also validates server-side.

### Q: Can I use this from a mobile app?
**A:** Yes, the API supports any HTTP client. Just make sure your app's domain is whitelisted in CORS.

### Q: What phone number formats are accepted?
**A:** Any valid international phone number matching the regex `/^\+?[1-9]\d{1,14}$/`. Brazilian formats like `5511999999999` or `11999999999` work perfectly.

---

## Support

**Backend API Issues:**
- Check API status: `https://api.yourdomain.com/api/health`
- Contact: backend team

**Frontend Integration Issues:**
- Verify CORS configuration
- Check network console for errors
- Ensure API base URL is correct

---

## Changelog

### v1.0 (2026-01-07)
- Initial release
- POST /waitlist endpoint
- Comprehensive validation
- Portuguese error messages
- Rate limiting enabled

---

**Ready to integrate?** Follow the examples above and you'll have the waitlist form working in minutes! 🚀
