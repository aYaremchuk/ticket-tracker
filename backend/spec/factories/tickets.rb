# frozen_string_literal: true

FactoryBot.define do
  factory :ticket do
    association :team
    association :created_by, factory: :user

    sequence(:title) { |n| "Ticket #{n}" }
    body        { "Default body text" }
    ticket_type { "bug" }
    state       { "new" }
    epic        { nil }
  end
end
