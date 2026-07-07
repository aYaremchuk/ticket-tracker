# frozen_string_literal: true

# A team groups epics and tickets. Name must be unique case-insensitively
# (backed by a citext column + unique DB index). We strip the name before
# validation so " Payments " and "payments" are treated the same.
#
# Reference checks (M3/M4):
#   TODO: Uncomment these associations once the epics/tickets tables exist.
#         DELETE will then automatically raise ActiveRecord::DeleteRestrictionError
#         if any epics or tickets reference the team, which TeamsController rescues
#         and maps to 409 team_has_references.
#
#   has_many :epics,   dependent: :restrict_with_error
#   has_many :tickets, dependent: :restrict_with_error
class Team < ApplicationRecord
  before_validation :strip_name

  validates :name,
    presence: true,
    uniqueness: { case_sensitive: false }

  # Returns the number of epics belonging to this team.
  # TODO: replace with `epics.count` once the epics table exists (M3).
  def epic_count
    0
  end

  # Returns the number of tickets belonging to this team.
  # TODO: replace with `tickets.count` once the tickets table exists (M4).
  def ticket_count
    0
  end

  # True when the team can be safely deleted (no referencing epics or tickets).
  # TODO: update to `epic_count.zero? && ticket_count.zero?` once M3/M4 land.
  def deletable?
    true
  end

  private

  def strip_name
    self.name = name.strip if name.present?
  end
end
