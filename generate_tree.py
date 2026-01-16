#!/usr/bin/env python3
"""
Скрипт для генерации tree-структуры репозитория с подсчетом символов в файлах
"""
import os
from pathlib import Path
from collections import defaultdict

def count_chars(file_path):
    """Подсчитывает количество символов в файле"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return len(f.read())
    except Exception as e:
        return 0

def get_tree_structure(root_dir, ignore_dirs=None):
    """Создает tree-структуру директории"""
    if ignore_dirs is None:
        ignore_dirs = {'.git', '__pycache__', 'node_modules', '.next', '.turbo', 'dist', 'build', '.sst'}
    
    root = Path(root_dir)
    file_info = []
    
    def walk_directory(path, prefix="", is_last=True):
        """Рекурсивно обходит директорию и создает tree-структуру"""
        try:
            items = sorted([item for item in path.iterdir()], key=lambda x: (x.is_file(), x.name.lower()))
            
            for i, item in enumerate(items):
                is_last_item = i == len(items) - 1
                current_prefix = "└── " if is_last_item else "├── "
                connector = "    " if is_last_item else "│   "
                
                if item.name in ignore_dirs:
                    continue
                
                if item.is_file():
                    char_count = count_chars(item)
                    relative_path = item.relative_to(root)
                    file_info.append((str(item), char_count, str(relative_path)))
                    yield f"{prefix}{current_prefix}{item.name} ({char_count:,})"
                elif item.is_dir():
                    yield f"{prefix}{current_prefix}{item.name}/"
                    next_prefix = prefix + connector
                    yield from walk_directory(item, next_prefix, is_last_item)
        except PermissionError:
            pass
    
    tree_lines = list(walk_directory(root))
    return tree_lines, file_info

def main():
    root_dir = "."
    output_file = "repo_structure.txt"
    
    print("Генерация tree-структуры...")
    tree_lines, file_info = get_tree_structure(root_dir)
    
    print("Сортировка файлов по размеру...")
    file_info.sort(key=lambda x: x[1], reverse=True)
    
    print("Запись в файл...")
    with open(output_file, 'w', encoding='utf-8') as f:
        # Записываем tree-структуру
        f.write("=" * 80 + "\n")
        f.write("TREE СТРУКТУРА РЕПОЗИТОРИЯ\n")
        f.write("=" * 80 + "\n\n")
        f.write(".\n")
        for line in tree_lines:
            f.write(line + "\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("ТОП 100 ФАЙЛОВ ПО КОЛИЧЕСТВУ СИМВОЛОВ (от больших к маленьким)\n")
        f.write("=" * 80 + "\n\n")
        
        # Записываем топ 100 файлов, отсортированные по размеру
        for full_path, char_count, relative_path in file_info[:100]:
            f.write(f"{full_path} ({char_count:,})\n")
    
    print(f"Готово! Результат сохранен в {output_file}")
    print(f"Всего файлов обработано: {len(file_info)}")

if __name__ == "__main__":
    main()
