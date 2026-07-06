# frozen_string_literal: true

# A team groups epics and tickets. Name must be unique case-insensitively
# (backed by a citext column + unique DB index). We strip the name before
# validation so " Payments " and "payments" are treated the same.
#
# Reference checks:
#   DELETE raises ActiveRecord::DeleteRestrictionError when the team still has
#   epics (M3) or tickets (M4), which TeamsController rescues and maps to
#   409 team_has_references.
#
#   TODO (M4): uncomment the tickets association once that table exists.
#   has_many :tickets, dependent: :restrict_with_error
class Team < ApplicationRecord
  has_many :epics, dependent: :restrict_with_error

  before_validation :strip_name

  validates :name,
    presence: true,
    uniqueness: { case_sensitive: false }

  # Returns the number of epics belonging to this team.
  def epic_count
    epics.count
  end

  # Returns the number of tickets belonging to this team.
  # TODO: replace with `tickets.count` once the tickets table exists (M4).
  def ticket_count
    0
  end

  # True when the team can be safely deleted (no referencing epics or tickets).
  # TODO (M4): also check ticket_count.zero? once tickets table exists.
  def deletable?
    epic_count.zero?
  end

  private

  def strip_name
    self.name = name.strip if name.present?
  end
end
