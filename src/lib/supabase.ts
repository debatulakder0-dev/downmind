export const getDeviceId = (): string => {
  let id = localStorage.getItem('dawnmind_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dawnmind_device_id', id);
  }
  return id;
};
