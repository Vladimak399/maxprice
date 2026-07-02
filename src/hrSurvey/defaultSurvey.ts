import type { HrSurveyQuestion } from "./types";

export const DEFAULT_HR_SURVEY_ID = "superceny-employee-satisfaction";

export const DEFAULT_HR_SURVEY = {
  id: DEFAULT_HR_SURVEY_ID,
  title: "Короткий HR-опрос Суперцены",
  description: "Опрос анонимный. Вопросы отличаются для магазина, офиса и склада. Обычно прохождение занимает 3-5 минут. Цель - быстро понять, что мешает работе, где есть риск текучки и какие изменения дадут лучший эффект."
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

  scale(5, "core_clarity", "Я понимаю, что от меня ожидают на работе.", "clarity"),
  scale(6, "core_tools", "У меня есть всё необходимое для нормальной работы.", "working_conditions"),
  scale(7, "core_manager", "Руководитель общается со мной уважительно и помогает решать рабочие вопросы.", "manager"),
  scale(8, "core_communication", "Изменения в работе до меня доводят вовремя и понятно.", "communication"),
  scale(9, "core_compensation", "Зарплата, премии и штрафы мне понятны.", "compensation"),
  scale(10, "core_safety", "Я могу сообщить о проблеме без страха негативных последствий.", "safety"),
  scale(11, "core_satisfaction", "Насколько вы сейчас довольны работой в Суперценах?", "satisfaction"),
  choice(12, "enps", "Насколько вероятно, что вы порекомендуете работу в Суперценах знакомому?", "enps", ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
  choice(13, "quit_risk", "Думали ли вы об увольнении за последний месяц?", "turnover", ["Нет", "Иногда", "Да, думаю", "Уже ищу работу"]),

  scale(14, "store_staffing", "В смене обычно хватает людей, чтобы выполнять работу нормально.", "staffing"),
  scale(15, "store_workload", "Мне хватает времени на основные задачи: касса, товар, ценники, порядок.", "workload"),
  scale(16, "store_office", "Задачи и требования офиса соответствуют реальной ситуации в магазине.", "office_store"),
  scale(17, "store_schedule", "График в магазине составляется понятно и заранее.", "schedule"),

  scale(18, "office_priorities", "Приоритеты и задачи в офисе понятны.", "clarity"),
  scale(19, "office_workload", "Рабочая нагрузка и сроки в офисе адекватные.", "workload"),
  scale(20, "office_stores", "Взаимодействие офиса с магазинами и складом работает нормально.", "office_store"),
  scale(21, "office_feedback", "Я получаю понятную обратную связь по своей работе.", "manager"),

  scale(22, "warehouse_workload", "Рабочая нагрузка на складе адекватная.", "workload"),
  scale(23, "warehouse_processes", "Процессы склада, поставок и взаимодействия с магазинами понятны.", "office_store"),
  scale(24, "warehouse_tools", "На складе хватает оборудования, условий и расходников для нормальной работы.", "working_conditions"),
  scale(25, "warehouse_schedule", "График на складе составляется понятно и заранее.", "schedule"),

  multi(26, "retention_factors", "Что больше всего удерживает вас в компании? Можно выбрать до 3 вариантов. Напишите номера через запятую.", "retention", ["Коллектив", "График", "Зарплата", "Руководитель", "Стабильность", "Близко к дому", "Развитие", "Привычная работа", "Пока нет альтернатив", "Другое"], 3),
  multi(27, "blockers", "Что сейчас больше всего мешает вам работать нормально? Можно выбрать до 3 вариантов. Напишите номера через запятую.", "blockers", ["Нехватка сотрудников", "Большая нагрузка", "График", "Зарплата", "Руководитель", "Коллектив", "Нехватка обучения", "Нехватка оборудования или расходников", "Плохая коммуникация", "Непонятные задачи", "Давление или грубое общение", "Проблемы между офисом и магазином", "Другое"], 3),
  multi(28, "improvements", "Что в первую очередь нужно улучшить? Можно выбрать до 3 вариантов. Напишите номера через запятую.", "improvements", ["Графики", "Обучение", "Зарплату и премии", "Коммуникацию с руководителем", "Условия на рабочем месте", "Количество сотрудников в смене", "Понятность задач", "Адаптацию новичков", "Работу офиса с магазинами", "Атмосферу в коллективе", "Безопасность и уважительное общение", "Другое"], 3),
  text(29, "one_change", "Какое одно изменение сильнее всего улучшило бы вашу работу?", "comment", true),
  text(30, "anonymous_problem", "Есть ли проблема, о которой вы хотите сообщить анонимно? Можно написать или нажать 'Пропустить'.", "anonymous_problem", false)
];
