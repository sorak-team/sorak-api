import { schoolYearService } from '../services/school-year.service.js';

export const listSchoolYears = async (req, res) => {
  const result = await schoolYearService.listSchoolYears(req.query);
  res.success(result);
};

export const getSchoolYearById = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.getSchoolYearById(id);
  res.success(result);
};

export const getActiveSchoolYear = async (req, res) => {
  const result = await schoolYearService.getActiveSchoolYear();
  res.success(result);
};

export const createSchoolYear = async (req, res) => {
  const result = await schoolYearService.createSchoolYear(req.body);
  res.status(201).success(result);
};

export const updateSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.updateSchoolYear(id, req.body);
  res.success(result);
};

export const activateSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.activateSchoolYear(id);
  res.success(result);
};

export const completeSchoolYear = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.completeSchoolYear(id);
  res.success(result);
};

export const listHolidays = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.listHolidays(id, req.query);
  res.success(result);
};

export const createHoliday = async (req, res) => {
  const { id } = req.params;
  const result = await schoolYearService.createHoliday(id, req.user?.sub, req.body);
  res.status(201).success(result);
};

export const updateHoliday = async (req, res) => {
  const { id, holidayId } = req.params;
  const result = await schoolYearService.updateHoliday(id, holidayId, req.user?.sub, req.body);
  res.success(result);
};

export const deleteHoliday = async (req, res) => {
  const { id, holidayId } = req.params;
  const result = await schoolYearService.deleteHoliday(id, holidayId);
  res.success(result);
};

