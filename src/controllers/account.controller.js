import { accountService } from '../services/account.service.js';


export const listAccounts = async (req, res) => {
  const result = await accountService.listAccounts(req.query);
  res.success(result);
};

