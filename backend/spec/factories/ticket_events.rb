# frozen_string_literal: true

FactoryBot.define do
  factory :ticket_event do
    association :ticket
    association :actor, factory: :user

    action    { "updated" }
    field     { "state" }
    old_value { "new" }
    new_value { "in_progress" }
  end
end
