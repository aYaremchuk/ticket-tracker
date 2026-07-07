# frozen_string_literal: true

# A team groups epics and tickets. Name must be unique case-insensitively
# (backed by a citext column + unique DB index). We strip the name before
# validation so " Payments " and "payments" are treated the same.
#
# Reference checks:
#   DELETE raises ActiveRecord::RecordNotDestroyed when the team still has
#   epics or tickets, which TeamsController rescues and maps to
#   409 team_has_references.
class Team < ApplicationRecord
  has_many :epics,   dependent: :restrict_with_error
  has_many :tickets, dependent: :restrict_with_error

  before_validation :strip_name

  validates :name,
    presence: true,
    uniqueness: { case_sensitive: false }

  # Returns the number of epics belonging to this team.
  def epic_count
    epics.count
  end

  # Returns the number of tickets belonging to this team.
  def ticket_count
    tickets.count
  end

  # True when the team can be safely deleted (no referencing epics or tickets).
  def deletable?
    epic_count.zero? && ticket_count.zero?
  end

  private

  def strip_name
    self.name = name.strip if name.present?
  end
end
