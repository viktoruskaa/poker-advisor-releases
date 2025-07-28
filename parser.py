import sys
import os
import json
import cv2
import numpy as np
import pytesseract
from PIL import Image

# --- Конфигурация для OCR ---
TESS_CONFIG_NUMBERS = r'--oem 3 --psm 6 outputbase digits'
TESS_CONFIG_TEXT = r'--oem 3 --psm 6'

def get_resource_path(relative_path):
    """ Получает абсолютный путь к ресурсу, работает как для скрипта, так и для PyInstaller бандла """
    if getattr(sys, 'frozen', False):
        # Если приложение 'заморожено' PyInstaller'ом
        base_path = sys._MEIPASS
    else:
        # Обычный запуск .py скрипта
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

class TableParser:
    def __init__(self, image_path, tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        self.image = cv2.imread(image_path)
        if self.image is None:
            raise ValueError("Не удалось загрузить изображение по пути: " + image_path)
        self.gray_image = cv2.cvtColor(self.image, cv2.COLOR_BGR2GRAY)
        self.templates_dir = get_resource_path('templates')
        self.output = {
            "players": [],
            "hero": {"cards": []},
            "board": [],
            "pot": 0,
            "blinds": {},
            "antes": 0
        }

    def _find_template(self, template_name, threshold=0.8):
        """Находит один объект на изображении по шаблону из папки templates."""
        template_path = os.path.join(self.templates_dir, template_name)
        template = cv2.imread(template_path, 0)
        if template is None:
            return None
        w, h = template.shape[::-1]
        res = cv2.matchTemplate(self.gray_image, template, cv2.TM_CCOEFF_NORMED)
        loc = np.where(res >= threshold)
        
        for pt in zip(*loc[::-1]):
            return (pt[0], pt[1], w, h)
        return None

    def _ocr_region(self, x, y, w, h, is_numeric=False):
        """Выполняет OCR для заданной области."""
        if x < 0 or y < 0 or x + w > self.image.shape[1] or y + h > self.image.shape[0]:
            return ""
            
        roi = self.gray_image[y:y+h, x:x+w]
        roi = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        roi = cv2.medianBlur(roi, 3)
        
        config = TESS_CONFIG_NUMBERS if is_numeric else TESS_CONFIG_TEXT
        text = pytesseract.image_to_string(Image.fromarray(roi), config=config).strip()
        
        if is_numeric:
            try:
                return float(''.join(filter(lambda i: i.isdigit() or i == '.', text)))
            except (ValueError, TypeError):
                return 0
        return text

    def parse(self):
        """Основной метод для парсинга всего стола."""
        dealer_button_coords = self._find_template('template_dealer_button.png')
        if not dealer_button_coords:
            return self.output 

        dx, dy, dw, dh = dealer_button_coords
        
        player_name_roi = (dx - 200, dy, 150, 30)
        player_stack_roi = (dx - 200, dy + 30, 150, 30)
        
        player_name = self._ocr_region(*player_name_roi)
        player_stack = self._ocr_region(*player_stack_roi, is_numeric=True)

        if player_name:
            self.output['players'].append({
                "name": player_name,
                "stack": player_stack,
                "bet": 0, "position": "BTN", "status": "active"
            })

        self.output['board'] = [] # Реальное распознавание карт нужно добавить
        pot_roi = (880, 380, 150, 50)
        self.output['pot'] = self._ocr_region(*pot_roi, is_numeric=True)
        self.output['hero']['cards'] = [] # Реальное распознавание карт нужно добавить

        return self.output

if __name__ == '__main__':
    if len(sys.argv) > 2:
        image_file_path = sys.argv[1]
        tesseract_exe_path = sys.argv[2]
        try:
            parser = TableParser(image_file_path, tesseract_exe_path)
            game_state_json = parser.parse()
            print(json.dumps(game_state_json, indent=2))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"error": "Incorrect arguments. Expected: <screenshot_path> <tesseract_path>"}))