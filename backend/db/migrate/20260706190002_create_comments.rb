# frozen_string_literal: true

# Comments table. Comments belong to a ticket and an author (user).
# ON DELETE CASCADE on ticket_id so deleting a ticket removes its comments
# without extra application code.
class CreateComments < ActiveRecord::Migration[8.1]
  def change
    create_table(:comments, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(
        :ticket,
        null: false,
        type: :uuid,
        foreign_key: { on_delete: :cascade },
        index: true,
      )
      t.references(
        :author,
        null: false,
        type: :uuid,
        foreign_key: { to_table: :users, on_delete: :restrict },
        index: true,
      )

      t.text(:body, null: false)

      t.timestamps
    end
  end
end
