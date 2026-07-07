# frozen_string_literal: true

# Shapes the public JSON view of a ticket activity event per docs/api-contract.md.
module TicketEventSerializer
  extend self

  def call(event)
    {
      id: event.id,
      ticket_id: event.ticket_id,
      actor: UserSerializer.call(event.actor),
      action: event.action,
      field: event.field,
      old_value: event.old_value,
      new_value: event.new_value,
      created_at: event.created_at.utc.iso8601,
    }
  end
end
