CREATE DATABASE kontext;

GRANT SELECT,UPDATE,DELETE,INSERT ON kontext.* TO 'kontext'@'%' IDENTIFIED BY 'kontext-secret';
FLUSH PRIVILEGES;
USE kontext;