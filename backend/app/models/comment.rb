# frozen_string_literal: true

# A comment belongs to a ticket and to an author (user). Adding a comment
# must NOT bump the ticket's modified_at — the Ticket model ensures this
# because comments never call save on the ticket.
class Comment < ApplicationRecord
  belongs_to :ticket
  belongs_to :author, class_name: "User"

  before_validation :strip_body

  validates :body, presence: true

  private

  def strip_body
    self.body = body.strip if body.present?
  end
end
