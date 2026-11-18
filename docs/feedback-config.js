(() => {
  const existing = window.NIBBANA_FEEDBACK_CONFIG || {};

  window.NIBBANA_FEEDBACK_CONFIG = {
    // Điền projectId và apiKey từ Firebase Console -> Project settings -> Your apps (Web app).
    // Đây là thông tin định danh công khai của dự án Firebase; bảo mật dữ liệu do firestore.rules đảm nhiệm.
    projectId: typeof existing.projectId === 'string' ? existing.projectId : 'nibbana-gamini-feedbacks',
    apiKey: typeof existing.apiKey === 'string' ? existing.apiKey : 'AIzaSyDmZyfHzcH2y8sN36xEh_dUI3HA7x8Ra9Y',
    // Tùy chọn cho kiểm thử nội bộ với Firebase Emulator Suite:
    firestoreEmulatorOrigin: typeof existing.firestoreEmulatorOrigin === 'string' ? existing.firestoreEmulatorOrigin : '',
    authEmulatorOrigin: typeof existing.authEmulatorOrigin === 'string' ? existing.authEmulatorOrigin : '',
  };
})();
