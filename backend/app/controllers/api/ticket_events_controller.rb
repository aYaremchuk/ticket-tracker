# frozen_string_literal: true

module Api
  # Read-only activity history: GET /api/tickets/:ticket_id/events, newest
  # first. Events are written by the Ticket and Comment models; there is no
  # write endpoint.
  class TicketEventsController < ApplicationController
    def index
      ticket = Ticket.find(params.expect(:ticket_id))

      # id DESC tie-breaks events created in the same second (multi-field save).
      events = ticket.ticket_events.includes(:actor).order(created_at: :desc, id: :desc)

      render(
        json: { events: events.map { |e| TicketEventSerializer.call(e) } },
        status: :ok,
      )
    end
  end
end
