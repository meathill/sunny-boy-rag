-- Product Keywords Seed Data
-- This file contains synonym mappings, translations, and abbreviations
-- for product search enhancement

-- SWITCHBOARDS (26 24 13)
INSERT OR REPLACE INTO product_keywords (section_id, keyword, keyword_type, language) VALUES
  ('26 24 13', 'switchboards', 'primary', 'en'),
  ('26 24 13', 'switchboard', 'synonym', 'en'),
  ('26 24 13', 'panel board', 'synonym', 'en'),
  ('26 24 13', 'panelboard', 'synonym', 'en'),
  ('26 24 13', 'distribution board', 'synonym', 'en'),
  ('26 24 13', 'distribution panel', 'synonym', 'en'),
  ('26 24 13', 'electrical panel', 'synonym', 'en'),
  ('26 24 13', '配电柜', 'translation', 'zh'),
  ('26 24 13', '配电板', 'translation', 'zh'),
  ('26 24 13', '开关柜', 'translation', 'zh');

-- MOTOR CONTROL CENTER (26 24 19)
INSERT OR REPLACE INTO product_keywords (section_id, keyword, keyword_type, language) VALUES
  ('26 24 19', 'motor control center', 'primary', 'en'),
  ('26 24 19', 'mcc', 'abbreviation', 'en'),
  ('26 24 19', 'motor control', 'synonym', 'en'),
  ('26 24 19', 'motor controller', 'synonym', 'en'),
  ('26 24 19', 'motor control panel', 'synonym', 'en'),
  ('26 24 19', '电机控制中心', 'translation', 'zh'),
  ('26 24 19', '马达控制中心', 'translation', 'zh'),
  ('26 24 19', '电动机控制柜', 'translation', 'zh');

-- LOW VOLTAGE BUSWAYS (26 25 13)
INSERT OR REPLACE INTO product_keywords (section_id, keyword, keyword_type, language) VALUES
  ('26 25 13', 'low voltage busways', 'primary', 'en'),
  ('26 25 13', 'busway', 'synonym', 'en'),
  ('26 25 13', 'busways', 'synonym', 'en'),
  ('26 25 13', 'busbar', 'synonym', 'en'),
  ('26 25 13', 'bus duct', 'synonym', 'en'),
  ('26 25 13', 'bus bar', 'synonym', 'en'),
  ('26 25 13', 'busbar trunking system', 'synonym', 'en'),
  ('26 25 13', '母线槽', 'translation', 'zh'),
  ('26 25 13', '低压母线', 'translation', 'zh'),
  ('26 25 13', '母线系统', 'translation', 'zh');
