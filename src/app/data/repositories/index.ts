import type { DatabaseHandle } from '../db/database';
import { AccountsRepository } from './accounts.repository';
import { AiReportsRepository } from './ai-reports.repository';
import { BudgetsRepository } from './budgets.repository';
import { CategoriesRepository } from './categories.repository';
import { CategoryRulesRepository } from './category-rules.repository';
import { EventsRepository } from './events.repository';
import { GoalsRepository } from './goals.repository';
import { InvestmentsRepository } from './investments.repository';
import { NotificationLogRepository } from './notification-log.repository';
import { ReconciliationsRepository } from './reconciliations.repository';
import { RecurrencesRepository } from './recurrences.repository';
import { SavingsRepository } from './savings.repository';
import { SettingsRepository } from './settings.repository';
import { TransfersRepository } from './transfers.repository';

export interface Repositories {
  readonly events: EventsRepository;
  readonly recurrences: RecurrencesRepository;
  readonly categories: CategoriesRepository;
  readonly categoryRules: CategoryRulesRepository;
  readonly aiReports: AiReportsRepository;
  readonly settings: SettingsRepository;
  readonly budgets: BudgetsRepository;
  readonly accounts: AccountsRepository;
  readonly transfers: TransfersRepository;
  readonly reconciliations: ReconciliationsRepository;
  readonly goals: GoalsRepository;
  readonly savings: SavingsRepository;
  readonly investments: InvestmentsRepository;
  readonly notificationLog: NotificationLogRepository;
}

export function createRepositories(db: DatabaseHandle): Repositories {
  return {
    events: new EventsRepository(db),
    recurrences: new RecurrencesRepository(db),
    categories: new CategoriesRepository(db),
    categoryRules: new CategoryRulesRepository(db),
    aiReports: new AiReportsRepository(db),
    settings: new SettingsRepository(db),
    budgets: new BudgetsRepository(db),
    accounts: new AccountsRepository(db),
    transfers: new TransfersRepository(db),
    reconciliations: new ReconciliationsRepository(db),
    goals: new GoalsRepository(db),
    savings: new SavingsRepository(db),
    investments: new InvestmentsRepository(db),
    notificationLog: new NotificationLogRepository(db),
  };
}

export {
  AccountsRepository,
  AiReportsRepository,
  BudgetsRepository,
  CategoriesRepository,
  CategoryRulesRepository,
  EventsRepository,
  GoalsRepository,
  InvestmentsRepository,
  NotificationLogRepository,
  ReconciliationsRepository,
  RecurrencesRepository,
  SavingsRepository,
  SettingsRepository,
  TransfersRepository,
};
