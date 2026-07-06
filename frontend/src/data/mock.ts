/**
 * Static mock data for the design prototype. No API calls — every screen
 * renders from these hardcoded fixtures so it can be screenshotted and
 * compared against docs/wireframes/.
 */
import type { TicketState, TicketType } from '../types/api'

export const currentUser = { email: 'alex@example.com' }

// --- Teams screen ---
export interface MockTeamRow {
  id: string
  name: string
  tickets: number
  epics: number
  modified: string
}

export const mockTeams: MockTeamRow[] = [
  { id: 't1', name: 'Payments Team', tickets: 42, epics: 5, modified: 'Today 12:40' },
  { id: 't2', name: 'Mobile Apps', tickets: 18, epics: 3, modified: 'Yesterday' },
  { id: 't3', name: 'Internal Tools', tickets: 0, epics: 0, modified: 'Jun 20' },
]

// --- Epics screen ---
export interface MockEpicRow {
  id: string
  title: string
  description: string
  tickets: number
  modified: string
}

export const mockEpics: MockEpicRow[] = [
  {
    id: 'e1',
    title: 'Checkout reliability',
    description: 'Improve checkout errors and recovery.',
    tickets: 16,
    modified: 'Today',
  },
  {
    id: 'e2',
    title: 'Payments v2',
    description: 'Next-generation payment processing.',
    tickets: 11,
    modified: 'Jun 22',
  },
  {
    id: 'e3',
    title: 'Fraud detection',
    description: 'Detect and block suspicious activity.',
    tickets: 7,
    modified: 'Jun 19',
  },
]

// --- Board screen ---
export interface MockBoardCard {
  id: string
  type: TicketType
  title: string
  epic: string | null
  ago: string
}

export interface MockBoardColumn {
  state: TicketState
  count: number
  cards: MockBoardCard[]
}

export const mockBoardColumns: MockBoardColumn[] = [
  {
    state: 'new',
    count: 8,
    cards: [
      { id: 'n1', type: 'bug', title: 'Payment fails for expired card', epic: 'Checkout reliability', ago: '2h ago' },
      { id: 'n2', type: 'feature', title: 'Add retry configuration', epic: 'Payments v2', ago: '1d ago' },
      { id: 'n3', type: 'fix', title: 'Align currency rounding', epic: null, ago: '3d ago' },
    ],
  },
  {
    state: 'ready_for_implementation',
    count: 6,
    cards: [
      { id: 'r1', type: 'feature', title: 'Support Apple Pay', epic: 'Payments v2', ago: '5h ago' },
      { id: 'r2', type: 'bug', title: 'Webhook retries duplicated', epic: 'Checkout reliability', ago: '1d ago' },
    ],
  },
  {
    state: 'in_progress',
    count: 9,
    cards: [
      { id: 'p1', type: 'fix', title: 'Handle 3DS timeout', epic: 'Checkout reliability', ago: '4h ago' },
      { id: 'p2', type: 'feature', title: 'Refund self-service', epic: 'Payments v2', ago: '2d ago' },
    ],
  },
  {
    state: 'ready_for_acceptance',
    count: 5,
    cards: [
      { id: 'a1', type: 'bug', title: 'Chargeback totals wrong', epic: 'Fraud detection', ago: '6h ago' },
      { id: 'a2', type: 'fix', title: 'Currency symbol overlap', epic: null, ago: '1d ago' },
    ],
  },
  {
    state: 'done',
    count: 14,
    cards: [
      { id: 'd1', type: 'feature', title: 'Saved cards', epic: 'Payments v2', ago: '3d ago' },
      { id: 'd2', type: 'bug', title: 'Double-submit on pay', epic: 'Checkout reliability', ago: '5d ago' },
    ],
  },
]

export const totalTicketCount = 42

// --- Ticket detail screen ---
export const mockTicket = {
  number: 1042,
  createdBy: 'Alex',
  createdAt: 'Jun 22, 09:15 UTC',
  modifiedAt: 'Jun 23, 12:40 UTC',
  team: 'Payments Team',
  type: 'bug' as TicketType,
  state: 'in_progress' as TicketState,
  epic: 'Checkout reliability',
  title: 'Payment fails for expired card',
  body: 'Steps to reproduce:\n1. Open checkout\n2. Use an expired card\n\nExpected: clear validation. Actual: generic error.',
}

export interface MockComment {
  id: string
  author: string
  time: string
  body: string
}

export const mockComments: MockComment[] = [
  { id: 'c1', author: 'Alex', time: '10:05', body: 'Reproduced in Chrome.' },
  { id: 'c2', author: 'Mina', time: '11:20', body: 'Backend returns HTTP 500.' },
]
