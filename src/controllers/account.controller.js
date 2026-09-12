import { accountService } from '../services/account.service.js';


export const listAccounts = async (req, res) => {
  const result = await accountService.listAccounts(req.query);
  res.success(result);
};

export const getAccountById = async (req, res) => {
  const { id } = req.params;
  const result = await accountService.getAccountById(id);
  res.success(result);
};

export const createAccount = async (req, res) => {
  const result = await accountService.createAccount(req.body);
  res.status(201).success(result);
};

export const updateAccount = async (req, res) => {
  const { id } = req.params;
  const result = await accountService.updateAccount(id, req.body);
  res.success(result);
};

export const toggleAccountStatus = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  const result = await accountService.changeStatus(id, !!isActive);
  res.success(result);
};

export const resetAccountPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const result = await accountService.resetPassword(id, newPassword);
  res.success(result);
};

