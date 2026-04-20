import { supabase } from '../supabase';
import { AuditLog, Notification } from '../types';

const normalizeAuditDetails = (details: AuditLog['details']) => {
  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details ?? '');
  }
};

export const logAudit = async (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
  try {
    await supabase.from('audit_logs').insert([{
      user_id: log.user_id,
      user_name: log.user_name,
      action: log.action,
      details: normalizeAuditDetails(log.details),
      type: log.type,
      timestamp: new Date().toISOString()
    }]);
  } catch (error) {
    console.error('Error logging audit:', error);
  }
};

export const sendNotification = async (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
  try {
    await supabase.from('notifications').insert([{
      user_id: notif.user_id,
      title: notif.title,
      message: notif.message,
      link: notif.link,
      read: false,
      timestamp: new Date().toISOString()
    }]);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};
