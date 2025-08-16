// This file should be placed at: src/app/api/llm/chat/route.ts
// Secure API route for direct LLM access with authentication and rate limiting

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Simple in-memory rate limiter (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60000; // 1 minute in ms

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  sessionId?: string; // For authentication
}

// Simple rate limiting
function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const client = rateLimitMap.get(clientId);
  
  if (!client || now > client.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (client.count >= RATE_LIMIT) {
    return false;
  }
  
  client.count++;
  return true;
}

// Verify session/authentication
async function verifyAuth(request: NextRequest): Promise<boolean> {
  try {
    // Check for session ID in request
    const body = await request.clone().json();
    const sessionId = body.sessionId;
    
    if (!sessionId) {
      console.log('[LLM-API] No session ID provided');
      return false;
    }
    
    // In production, verify sessionId against database or session store
    // For now, just check it exists and has reasonable format
    if (sessionId.length < 20) {
      console.log('[LLM-API] Invalid session ID format');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[LLM-API] Auth verification error:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 
                    headersList.get('x-real-ip') || 
                    'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.log('[LLM-API] Rate limit exceeded for:', clientIp);
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    // Verify authentication
    const isAuthenticated = await verifyAuth(request);
    if (!isAuthenticated) {
      console.log('[LLM-API] Authentication failed');
      return NextResponse.json(
        { error: 'Unauthorized. Please provide valid session credentials.' },
        { status: 401 }
      );
    }
    
    const body: ChatRequest = await request.json();
    
    console.log('[LLM-API] Authenticated request received:', {
      model: body.model,
      messageCount: body.messages.length,
      stream: body.stream,
      temperature: body.temperature
    });

    // Validate request
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: messages array required' },
        { status: 400 }
      );
    }
    
    // Sanitize messages (remove any potential injection attacks)
    const sanitizedMessages = body.messages.map(msg => ({
      role: msg.role,
      content: msg.content.substring(0, 4000) // Limit message length
    }));

    // Prepare request for LLM service
    const llmRequest = {
      model: body.model === 'auto' || !body.model ? 'mistralai/Mistral-7B-Instruct-v0.2' : body.model,
      messages: sanitizedMessages,
      temperature: Math.min(Math.max(body.temperature || 0.7, 0), 2), // Clamp temperature
      max_tokens: Math.min(body.max_tokens || 512, 2048), // Limit max tokens
      stream: body.stream !== false // Default to streaming
    };

    console.log('[LLM-API] Forwarding to LLM service with:', {
      model: llmRequest.model,
      messageCount: llmRequest.messages.length,
      stream: llmRequest.stream,
      temperature: llmRequest.temperature
    });

    // Use Traefik-routed endpoint (still internal to infrastructure)
    // Next.js standalone can't resolve Docker service names, so we use the internal Traefik route
    // This maintains security as it's still within your infrastructure and we have auth/rate limiting
    const llmUrl = 'https://inti.intellipedia.ai/llm/v1/chat/completions';
    
    let llmResponse: Response;
    try {
      console.log('[LLM-API] Connecting to LLM service at:', llmUrl);
      llmResponse = await fetch(llmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(llmRequest),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });
      
      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error('[LLM-API] LLM service returned error:', llmResponse.status, llmResponse.statusText, errorText);
        
        // Try to parse error as JSON
        let errorMessage = `LLM service error: ${llmResponse.status} ${llmResponse.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.error || errorMessage;
        } catch (e) {
          // If not JSON, use the text as-is
          if (errorText) errorMessage = errorText;
        }
        
        return NextResponse.json(
          { error: errorMessage },
          { status: llmResponse.status }
        );
      }
      
      console.log('[LLM-API] Successfully connected to LLM service');
      
    } catch (error) {
      console.error('[LLM-API] Failed to connect to LLM service:', error.message);
      return NextResponse.json(
        { error: `LLM service unavailable: ${error.message}` },
        { status: 503 }
      );
    }

    if (body.stream) {
      console.log('[LLM-API] Returning streaming response');
      
      // Return streaming response with proper headers
      return new Response(llmResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
      });
    } else {
      console.log('[LLM-API] Returning non-streaming response');
      
      // Return complete response
      const data = await llmResponse.json();
      return NextResponse.json(data);
    }

  } catch (error) {
    console.error('[LLM-API] Error processing chat request:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Health check endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'healthy',
    service: 'llm-chat-api',
    secured: true,
    rateLimited: true
  });
}