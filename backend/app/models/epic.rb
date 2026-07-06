# frozen_string_literal: true

# An epic groups related tickets within a single team. The team is fixed at
# creation — team_id is declared readonly so it cannot be changed via mass
# assignment or model update. Title must be present (non-blank after stripping).
#
# Reference checks (M4):
#   TODO: Uncomment once the tickets table exists. DELETE will then
#         raise ActiveRecord::DeleteRestrictionError when the epic still has
#         tickets, which EpicsController rescues and maps to 409 epic_has_tickets.
#
#   has_many :tickets, dependent: :restrict_with_error
class Epic < ApplicationRecord
  belongs_to :team

  # team_id is immutable — reject attempts to change it on persisted records.
  attr_readonly :team_id

  before_validation :strip_title

  validates :title, presence: true

  # Returns the number of tickets belonging to this epic.
  # TODO: replace with `tickets.count` once the tickets table exists (M4).
  def ticket_count
    0
  end

  private

  def strip_title
    self.title = title.strip if title.present?
  end
end
