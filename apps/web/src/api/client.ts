import { healthResponseSchema } from "@kv-infra/shared";
import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
});

export const getHealth = async () => {
  const response = await api.get("/health");
  return healthResponseSchema.parse(response.data);
};
