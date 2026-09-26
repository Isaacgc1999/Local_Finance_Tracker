import type { DatabaseHandle } from '../db/database';
import { AccountsRepository } from './accounts.repository';
import { AiReportsRepository } from './ai-reports.repository';
import { BudgetsRepository } from './budgets.repository';
import { CategoriesRepository } from './categories.repository';
import { EventsRepository } from './events.repository';
import { ReconciliationsRepository } from './reconciliations.repository';
import { RecurrencesRepository } from './recurrences.repository';
import { SettingsRepository } from './settings.repository';
import { TransfersRepository } from './transfers.repository';

export interface Repositories {
  readonly events: EventsRepository;
  readonly recurrences: RecurrencesRepository;
  readonly categories: CategoriesRepository;
  readonly aiReports: AiReportsRepository;
  readonly settings: SettingsRepository;
  readonly budgets: BudgetsRepository;
  readonly accounts: AccountsRepository;
  readonly transfers: TransfersRepository;
  readonly reconciliations: ReconciliationsRepository;
}

export function createRepositories(db: DatabaseHandle): Repositories {
  return {
    events: new EventsRepository(db),
    recurrences: new RecurrencesRepository(db),
    categories: new CategoriesRepository(db),
    aiReports: new AiReportsRepository(db),
    settings: new SettingsRepository(db),
    budgets: new BudgetsRepository(db),
    accounts: new AccountsRepository(db),
    transfers: new TransfersRepository(db),
    reconciliations: new ReconciliationsRepository(db),
  };
}

export {
  AccountsRepository,
  AiReportsRepository,
  BudgetsRepository,
  CategoriesRepository,
  EventsRepository,
  ReconciliationsRepository,
  RecurrencesRepository,
  SettingsRepository,
  TransfersRepository,
};
