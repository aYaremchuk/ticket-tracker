# frozen_string_literal: true

FactoryBot.define do
  factory :epic do
    association :team
    sequence(:title) { |n| "Epic #{n}" }
    description { nil }
  end
end
