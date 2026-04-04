// Re-export session helpers from customer-auth for account pages
export { getCustomerSession as getAccountSession, requireCustomerSession as requireAccountSession } from "./customer-auth";
