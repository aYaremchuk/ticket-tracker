# frozen_string_literal: true

# A comment belongs to a ticket and to an author (user). Adding a comment
# must NOT bump the ticket's modified_at — the Ticket model ensures this
# because comments never call save on the ticket.
class Comment < ApplicationRecord
  belongs_to :ticket
  belongs_to :author, class_name: "User"

  before_validation :strip_body

  validates :body, presence: true

  after_create  :record_commented_event
  after_update  :record_edited_event
  after_destroy :record_deleted_event

  private

  def strip_body
    self.body = body.strip if body.present?
  end

  # Activity events write only TicketEvent rows — the ticket itself is never
  # saved, so modified_at and board ordering stay untouched (spec §7). The
  # author fallback covers comments built outside a request (specs, console).

  def record_commented_event
    ticket.ticket_events.create!(
      actor: Current.user || author,
      action: "commented",
      new_value: TicketEvent.display_value("body", body),
    )
  end

  def record_edited_event
    return unless saved_change_to_body?

    ticket.ticket_events.create!(
      actor: Current.user || author,
      action: "comment_edited",
      old_value: TicketEvent.display_value("body", saved_change_to_body.first),
      new_value: TicketEvent.display_value("body", body),
    )
  end

  def record_deleted_event
    # Skip when the comment dies with its ticket — the history cascades away too.
    return if destroyed_by_association

    ticket.ticket_events.create!(
      actor: Current.user || author,
      action: "comment_deleted",
      old_value: TicketEvent.display_value("body", body),
    )
  end
end
