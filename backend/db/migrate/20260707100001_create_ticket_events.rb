# frozen_string_literal: true

# Ticket activity history (optional stretch feature). One row per recorded
# change: a "created" event on ticket creation, and one "updated" event per
# tracked field change (title, body, type, state, team, epic).
#
# ON DELETE CASCADE on ticket_id so deleting a ticket removes its history,
# mirroring comments. Events are immutable — no updated_at column.
class CreateTicketEvents < ActiveRecord::Migration[8.1]
  def change
    create_table(:ticket_events, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(
        :ticket,
        null: false,
        type: :uuid,
        foreign_key: { on_delete: :cascade },
        index: true,
      )
      t.references(
        :actor,
        null: false,
        type: :uuid,
        foreign_key: { to_table: :users, on_delete: :restrict },
        index: true,
      )

      t.string(:action, null: false)
      # field/old_value/new_value are null for "created" events.
      t.string(:field)
      t.text(:old_value)
      t.text(:new_value)

      t.datetime(:created_at, null: false)
    end
  end
end
