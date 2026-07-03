import type { HrSurveyQuestion } from "./types";

export const DEFAULT_HR_SURVEY_ID = "superceny-employee-satisfaction-v2";

export const DEFAULT_HR_SURVEY = {
  id: DEFAULT_HR_SURVEY_ID,
  title: "Короткий HR-опрос Суперцены",
  description: "Опрос анонимный. Вопросы отличаются для магазина, офиса и склада. Обычно прохождение занимает 3-4 минуты. Цель - быстро понять, что мешает работе, где есть риск текучки и какие изменения дадут лучший эффект."
};

type Q = Omit<HrSurveyQuestion, "id" | "surveyId">;

const scale = (position: number, code: string, text: string, category: string): Q => ({
  position,
  code,
  text,
  category,
  type: "scale_1_5",
  options: [],
  required: true,
  maxChoices: null
});

const choice = (position: number, code: string, text: string, category: string, options: string[], required = true): Q => ({
  position,
  code,
  text,
  category,
  type: "single_choice",
  options,
  required,
  maxChoices: null
});

const multi = (position: number, code: string, text: string, category: string, options: string[], maxChoices: number): Q => ({
  position,
  code,
  text,
  category,
  type: "multi_choice",
  options,
  required: true,
  maxChoices
});

const text = (position: number, code: string, question: string, category: string, required = false): Q => ({
  position,
  code,
  text: question,
  category,
  type: "text",
  options: [],
  required,
  maxChoices: null
});

export const DEFAULT_HR_QUESTIONS: Q[] = [
  choice(1, "workplace", "Где вы работаете?", "profile", ["Магазин", "Офис", "Склад", "Другое"]),
  choice(2, "role", "Ваша роль?", "profile", ["Продавец-кассир", "Старший смены", "Администратор", "Товаровед", "Офисный сотрудник", "Руководитель", "Складской сотрудник", "Другое"]),
  choice(3, "tenure", "Как давно вы работаете в Суперценах?", "profile", ["Меньше 1 месяца", "1-3 месяца", "3-6 месяцев", "6-12 месяцев", "Больше года"]),
  text(4, "store_or_department", "Укажите магазин, склад или отдел, если готовы. Если не хотите указывать, напишите 'не указывать'.", "profile", false),

  scale(5, "core_clarity", "Я понимаю свои основные задачи и зону ответственности.", "clarity"),
  scale(6, "core_manager", "Руководитель общается со мной уважительно и помогает решать рабочие вопросы.", "manager"),
  scale(7, "core_communication", "Изменения в работе до меня доводят вовремя и понятно.", "communication"),
  scale(8, "core_compensation", "Зарплата, премии и штрафы мне понятны.", "compensation"),
  scale(9, "core_schedule", "График или режим работы понятен заранее.", "schedule"),
  scale(10, "core_safety", "Я могу сообщить о проблеме без страха негативных последствий.", "safety"),
  scale(11, "core_satisfaction", "Насколько вы сейчас довольны работой в Суперценах?", "satisfaction"),
  choice(12, "enps", "Насколько вероятно, что вы порекомендуете работу в Суперценах знакомому?", "enps", ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
  choice(13, "quit_risk", "Думали ли вы об увольнении за последний месяц?", "turnover", ["Нет", "Иногда", "Да, думаю", "Уже ищу работу"]),

  scale(14, "store_staffing", "В смене обычно хватает людей, чтобы выполнять работу нормально.", "staffing"),
  scale(15, "store_daily_tasks", "Мне хватает времени на кассу, товар, ценники и порядок в зале.", "workload"),
  scale(16, "store_office_tasks", "Задачи от офиса реально выполнить в условиях магазина.", "office_store"),

  scale(17, "office_workload", "Объём задач и сроки в офисе адекватные.", "workload"),
  scale(18, "office_crosswork", "Взаимодействие офиса с магазинами и складом работает без лишней путаницы.", "office_store"),
  scale(19, "office_access", "Мне хватает данных, доступов и информации для выполнения своих задач.", "working_conditions"),

  scale(20, "warehouse_workload", "Нагрузка на складе адекватная.", "workload"),
  scale(21, "warehouse_processes", "Процессы поставок, перемещений и взаимодействия с магазинами понятны.", "office_store"),
  scale(22, "warehouse_resources", "На складе хватает оборудования, условий и расходников для нормальной работы.", "working_conditions"),

  multi(23, "blockers", "Что сейчас больше всего мешает вам работать нормально? Можно выбрать до 3 вариантов. Напишите номера через запятую.", "blockers", ["Нехватка сотрудников", "Большая нагрузка", "График", "Зарплата", "Руководитель", "Коллектив", "Нехватка обучения", "Нехватка оборудования или расходников", "Плохая коммуникация", "Непонятные задачи", "Давление или грубое общение", "Проблемы между офисом и магазином", "Другое"], 3),
  multi(24, "improvements", "Что в первую очередь нужно улучшить? Можно выбрать до 3 вариантов. Напишите номера через запятую.", "improvements", ["Графики", "Обучение", "Зарплату и премии", "Коммуникацию с руководителем", "Условия на рабочем месте", "Количество сотрудников в смене", "Понятность задач", "Адаптацию новичков", "Работу офиса с магазинами", "Атмосферу в коллективе", "Безопасность и уважительное общение", "Другое"], 3),
  text(25, "one_change", "Какое одно изменение сильнее всего улучшило бы вашу работу?", "comment", true),
  text(26, "anonymous_problem", "Есть ли проблема, о которой вы хотите сообщить анонимно? Можно написать или нажать 'Пропустить'.", "anonymous_problem", false)
];
