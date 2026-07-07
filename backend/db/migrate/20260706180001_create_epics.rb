# frozen_string_literal: true

# Epics table. Each epic belongs to exactly one team (fixed at creation).
# team_id uses ON DELETE RESTRICT at the DB level so that deleting a team
# that still has epics is blocked even if the application-layer guard is
# somehow bypassed. title is NOT NULL; description is nullable text.
class CreateEpics < ActiveRecord::Migration[8.1]
  def change
    create_table(:epics, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(
        :team,
        null: false,
        type: :uuid,
        foreign_key: { on_delete: :restrict },
        index: true,
      )
      t.string(:title, null: false)
      t.text(:description)

      t.timestamps
    end
  end
end
