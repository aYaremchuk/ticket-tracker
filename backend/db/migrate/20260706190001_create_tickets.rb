# frozen_string_literal: true

# Tickets table. Each ticket belongs to a team and optionally to an epic
# (epic_id is nullable). The `number` column is auto-assigned from a dedicated
# Postgres sequence so it's gapless-safe under concurrent inserts and provides
# the human-friendly TCK-<number> reference.
#
# `modified_at` is a dedicated column (NOT Rails' updated_at) that is bumped
# only when real ticket fields change. Adding a comment must NOT touch this.
#
# FKs:
#   team_id  → teams  ON DELETE RESTRICT (cannot delete a team that has tickets)
#   epic_id  → epics  ON DELETE RESTRICT (cannot delete an epic that has tickets)
#   created_by_id → users  ON DELETE RESTRICT
class CreateTickets < ActiveRecord::Migration[8.1]
  def up
    # Dedicated sequence for the human-friendly ticket number (TCK-<n>).
    execute("CREATE SEQUENCE ticket_number_seq START 1 INCREMENT 1 NO CYCLE")

    create_table(:tickets, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.integer(
        :number,
        null: false,
        default: -> { "nextval('ticket_number_seq')" },
      )

      t.references(
        :team,
        null: false,
        type: :uuid,
        foreign_key: { on_delete: :restrict },
        index: true,
      )
      t.references(
        :epic,
        null: true,
        type: :uuid,
        foreign_key: { on_delete: :restrict },
        index: true,
      )
      t.references(
        :created_by,
        null: false,
        type: :uuid,
        foreign_key: { to_table: :users, on_delete: :restrict },
        index: true,
      )

      t.string(:ticket_type, null: false) # `type` is reserved by STI
      t.string(:state,       null: false, default: "new")
      t.string(:title,       null: false)
      t.text(:body, null: false)

      t.datetime(:modified_at, null: false)

      t.timestamps
    end

    add_index(:tickets, :number, unique: true)
    add_index(:tickets, :state)
    add_index(:tickets, :modified_at)
  end

  def down
    drop_table(:tickets)
    execute("DROP SEQUENCE IF EXISTS ticket_number_seq")
  end
end
