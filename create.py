import os

def read_and_write_files(directory, output_file, exclude_dirs=None, exclude_files=None):
    """
    Рекурсивно читает файлы в директории, исключая указанные папки и файлы,
    и записывает их названия и содержимое в выходной файл.

    :param directory: Путь к директории для сканирования.
    :param output_file: Путь к файлу для записи результатов.
    :param exclude_dirs: Список названий папок, которые нужно исключить.
    :param exclude_files: Список названий файлов, которые нужно исключить.
    :return: Список путей к файлам, которые были успешно обработаны.
    """
    if exclude_dirs is None:
        exclude_dirs = []
    if exclude_files is None:
        exclude_files = []

    processed_files_list = []
    try:
        with open(output_file, 'w', encoding='utf-8') as out_f:
            for root, dirs, files in os.walk(directory, topdown=True):
                # Исключаем ненужные директории из дальнейшего обхода
                # [d for d in dirs] создает копию, чтобы можно было безопасно изменять dirs
                dirs[:] = [d for d in dirs if d not in exclude_dirs]

                for file in files:
                    # Пропускаем файлы из списка исключений
                    if file in exclude_files:
                        continue

                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as in_f:
                            content = in_f.read()
                            out_f.write(f"--- Файл: {file_path} ---\n\n")
                            out_f.write(content)
                            out_f.write("\n\n" + "="*80 + "\n\n")
                            processed_files_list.append(file_path)
                    except Exception as e:
                        print(f"Не удалось прочитать файл {file_path}: {e}")
    except Exception as e:
        print(f"Произошла критическая ошибка: {e}")

    return processed_files_list

# --- Основной блок для запуска ---
if __name__ == "__main__":
    # Укажите путь к вашей папке. '.' означает текущую директорию.
    source_directory = '.'

    # --- Умное имя для выходного файла ---
    # Берем имя текущей папки и добавляем к нему "_contents.txt"
    project_name = os.path.basename(os.path.abspath(source_directory))
    output_filename = f"{project_name}_contents.txt"

    # --- Списки исключений ---
    dirs_to_exclude = ['node_modules', '.git', '.vscode', '__pycache__']
    files_to_exclude = ['package-lock.json', 'create.py']

    # Добавляем в исключения сам скрипт и его выходной файл, чтобы они не попали в результат
    script_name = os.path.basename(__file__)
    files_to_exclude.append(script_name)
    files_to_exclude.append(output_filename)

    # --- Запуск функции и вывод результата ---
    processed_files = read_and_write_files(
        source_directory,
        output_filename,
        exclude_dirs=dirs_to_exclude,
        exclude_files=files_to_exclude
    )

    print("\n--- ЗАВЕРШЕНО ---")
    print(f"Результат записан в файл: {output_filename}")
    print("\nИсключенные директории:", dirs_to_exclude)
    print("Исключенные файлы:", files_to_exclude)

    if processed_files:
        print(f"\n✅ Успешно обработано и записано {len(processed_files)} файлов:")
        for f_path in processed_files:
            print(f"  - {f_path}")
    else:
        print("\nНе найдено файлов для обработки с учетом заданных исключений.")