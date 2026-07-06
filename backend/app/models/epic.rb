# frozen_string_literal: true

# An epic groups related tickets within a single team. The team is fixed at
# creation — team_id is declared readonly so it cannot be changed via mass
# assignment or model update. Title must be present (non-blank after stripping).
#
# Reference checks:
#   DELETE raises ActiveRecord::RecordNotDestroyed when the epic still has
#   tickets, which EpicsController rescues and maps to 409 epic_has_tickets.
class Epic < ApplicationRecord
  belongs_to :team
  has_many :tickets, dependent: :restrict_with_error

  # team_id is immutable — reject attempts to change it on persisted records.
  attr_readonly :team_id

  before_validation :strip_title

  validates :title, presence: true

  # Returns the number of tickets belonging to this epic.
  def ticket_count
    tickets.count
  end

  private

  def strip_title
    self.title = title.strip if title.present?
  end
end
