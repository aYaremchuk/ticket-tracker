/**
 * Shared API types — mirror docs/api-contract.md. Keep in sync with the Rails
 * serializers. All timestamps are ISO-8601 UTC strings.
 */

// --- Enums (canonical API values; UI maps to human labels) ---
export const TICKET_TYPES = ['bug', 'feature', 'fix'] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const TICKET_STATES = [
  'new',
  'ready_for_implementation',
  'in_progress',
  'ready_for_acceptance',
  'done',
] as const
export type TicketState = (typeof TICKET_STATES)[number]

// Human-readable labels for display.
export const TICKET_STATE_LABELS: Record<TicketState, string> = {
  new: 'New',
  ready_for_implementation: 'Ready for Implementation',
  in_progress: 'In Progress',
  ready_for_acceptance: 'Ready for Acceptance',
  done: 'Done',
}

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  fix: 'Fix',
}

// --- Core entities ---
export interface UserRef {
  id: string
  email: string
}

export interface CurrentUser {
  id: string
  email: string
}

export interface Team {
  id: string
  name: string
  ticket_count: number
  epic_count: number
  created_at: string
  modified_at: string
}

export interface Epic {
  id: string
  team_id: string
  title: string
  description: string | null
  ticket_count: number
  created_at: string
  modified_at: string
}

export interface Ticket {
  id: string
  number: number
  team_id: string
  epic_id: string | null
  type: TicketType
  state: TicketState
  title: string
  body: string
  created_by: UserRef
  created_at: string
  modified_at: string
  comment_count: number
}

export interface Comment {
  id: string
  ticket_id: string
  author: UserRef
  body: string
  created_at: string
}

// --- Auth payloads ---
// Login establishes an HttpOnly session cookie (no token in the body).
export interface LoginResponse {
  user: CurrentUser
}

// --- Request bodies ---
export interface SignupRequest {
  email: string
  password: string
}
export interface LoginRequest {
  email: string
  password: string
}
export interface TeamRequest {
  name: string
}
export interface EpicRequest {
  team_id?: string // required on create, immutable after
  title?: string
  description?: string | null
}
export interface TicketCreateRequest {
  team_id: string
  type: TicketType
  title: string
  body: string
  epic_id?: string | null
}
export interface TicketUpdateRequest {
  type?: TicketType
  team_id?: string
  epic_id?: string | null
  title?: string
  body?: string
  state?: TicketState
}
export interface CommentRequest {
  body: string
}

// --- Filters ---
export interface TicketFilters {
  team_id: string
  type?: TicketType
  epic_id?: string
  q?: string
}

// --- Error envelope ---
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}
