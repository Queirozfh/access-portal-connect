CREATE TABLE public.feature_access_levels (
  level smallint PRIMARY KEY CHECK (level BETWEEN 1 AND 5),
  features jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_access_levels (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 1 REFERENCES public.feature_access_levels(level),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_access_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_levels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_access_levels, public.user_access_levels FROM anon, authenticated;
GRANT ALL ON public.feature_access_levels, public.user_access_levels TO service_role;

INSERT INTO public.feature_access_levels(level, features) VALUES
(1, '["home.view","receivable.view","expenses.view","privacy.toggle"]'::jsonb),
(2, '["home.view","receivable.view","receivable.add","receivable.edit","receivable.receive","receivable.ledger","expenses.view","expenses.add","expenses.quick","expenses.edit","expenses.pay","subscriptions.view","invoices.view","installments.view","timeline.view","privacy.toggle"]'::jsonb),
(3, '["home.view","receivable.view","receivable.add","receivable.edit","receivable.receive","receivable.ledger","receivable.receipt","receivable.whatsapp","expenses.view","expenses.add","expenses.quick","expenses.edit","expenses.pay","expenses.delete","expenses.assignCard","expenses.split","expenses.reorder","subscriptions.view","invoices.view","invoices.bills.manage","invoices.cards.manage","invoices.reimbursements.manage","installments.view","installments.reorder","timeline.view","assets.view","planning.view","reports.view","privacy.toggle"]'::jsonb),
(4, '["home.view","receivable.view","receivable.add","receivable.edit","receivable.receive","receivable.ledger","receivable.receipt","receivable.whatsapp","expenses.view","expenses.add","expenses.quick","expenses.edit","expenses.pay","expenses.delete","expenses.bulkDelete","expenses.assignCard","expenses.split","expenses.reorder","subscriptions.view","invoices.view","invoices.bills.manage","invoices.cards.manage","invoices.reimbursements.manage","installments.view","installments.reorder","timeline.view","assets.view","assets.manage","assets.goals","assets.emergencyReserve","assets.passiveIncome","planning.view","planning.analyze","planning.compound","planning.vehicleSimulator","reports.view","reports.export","settings.view","settings.people","settings.categories","settings.criteria","privacy.toggle"]'::jsonb),
(5, '["home.view","receivable.view","receivable.add","receivable.edit","receivable.receive","receivable.ledger","receivable.receipt","receivable.whatsapp","expenses.view","expenses.add","expenses.quick","expenses.edit","expenses.pay","expenses.delete","expenses.bulkDelete","expenses.assignCard","expenses.split","expenses.reorder","subscriptions.view","invoices.view","invoices.bills.manage","invoices.cards.manage","invoices.reimbursements.manage","installments.view","installments.reorder","timeline.view","assets.view","assets.manage","assets.goals","assets.emergencyReserve","assets.passiveIncome","planning.view","planning.analyze","planning.compound","planning.vehicleSimulator","reports.view","reports.export","settings.view","settings.people","settings.categories","settings.criteria","settings.companyFiscal","settings.security","account.export","privacy.toggle","integrations.openFinance"]'::jsonb)
ON CONFLICT (level) DO NOTHING;

-- Existing authorized users keep the complete experience; new accounts start at level 1.
INSERT INTO public.user_access_levels(user_id, level)
SELECT id, 5 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
