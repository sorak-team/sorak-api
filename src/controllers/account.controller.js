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

