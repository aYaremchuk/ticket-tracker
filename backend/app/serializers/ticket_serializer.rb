# frozen_string_literal: true

# Shapes the public JSON view of a ticket per docs/api-contract.md.
# The DB column `ticket_type` is exposed as `type` (Rails reserves `type` for STI).
# The optional `comment_count:` argument accepts a precomputed value to avoid N+1
# on index; when nil it falls through to comments.count.
module TicketSerializer
  extend self

  def call(ticket, comment_count: nil)
    {
      id: ticket.id,
      number: ticket.number,
      team_id: ticket.team_id,
      epic_id: ticket.epic_id,
      type: ticket.ticket_type,
      state: ticket.state,
      title: ticket.title,
      body: ticket.body,
      created_by: UserSerializer.call(ticket.created_by),
      created_at: ticket.created_at.utc.iso8601,
      modified_at: ticket.modified_at.utc.iso8601,
      comment_count: comment_count.nil? ? ticket.comments.count : comment_count,
    }
  end
end
